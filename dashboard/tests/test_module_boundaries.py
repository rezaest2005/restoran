"""
Module boundary guard (AST based, no dependencies).

* every source file belongs to a module (module_registry.MODULES);
* no module imports another module's internals outside the declared public interface / dependency table;
* today's violations are an explicit baseline (module_violations_baseline.py) that can only SHRINK:
  a new violation fails, and so does a baseline entry that no longer exists (delete it);
* the registry itself is consistent (hard module prerequisites are declared edges, public files exist,
  every test file has an owner, every domain event is declared, published and subscribed).

Regenerate the baseline after decoupling work with:  python scripts/gen_module_docs.py --baseline
"""
import ast
import os

from django.test import SimpleTestCase, TestCase

from bizsuite import events, module_boundaries as mb, module_registry as reg
from bizsuite.module_violations_baseline import BASELINE

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))


def _fmt(items):
    return "\n".join("  " + " | ".join(i) for i in sorted(items))


class BoundaryGuard(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.found, cls.unowned = mb.collect()

    def test_every_source_file_has_a_module(self):
        self.assertEqual(self.unowned, [], "add these files to a module in module_registry.MODULES")

    def test_no_new_violations(self):
        new = self.found - BASELINE
        self.assertFalse(new, "New cross-module imports (use the owner's public API or a domain event, "
                              "see docs/MODULES.md):\n" + _fmt(new))

    def test_baseline_is_shrink_only(self):
        gone = BASELINE - self.found
        self.assertFalse(gone, "These baseline violations no longer exist - delete them from "
                               "bizsuite/module_violations_baseline.py (python scripts/gen_module_docs.py --baseline):\n"
                         + _fmt(gone))


class RegistryConsistency(TestCase):
    def test_edges_are_between_known_business_modules(self):
        for src, dsts in reg.DEPENDS_ON.items():
            self.assertIn(src, reg.MODULES)
            self.assertNotEqual(reg.tier(src), reg.CORE, f"core module {src} may not declare dependencies")
            for d in dsts:
                self.assertIn(d, reg.MODULES)

    def test_hard_module_requirements_are_declared_edges(self):
        from bizsuite.modules import CATALOG
        for m in CATALOG:
            for req in m["requires"]:
                self.assertIn(req, reg.DEPENDS_ON.get(m["code"], []),
                              f"modules.py says {m['code']} requires {req}: declare it in DEPENDS_ON")

    def test_public_api_files_exist(self):
        for name, m in reg.MODULES.items():
            for f in m["public_api"]:
                self.assertTrue(os.path.isfile(os.path.join(mb.PKG, f)), f"{name}: public_api {f} missing")
                self.assertEqual(reg.module_of(f), name, f"{f} is listed as public API of {name} but owned elsewhere")

    def test_every_test_file_has_a_module(self):
        orphans = [f for f in os.listdir(TESTS_DIR)
                   if f.startswith("test_") and f.endswith(".py") and reg.owner_of_test(f) is None]
        self.assertEqual(orphans, [], "add these test files to a module's 'tests' list in module_registry")

    def test_declared_test_files_exist(self):
        have = {f[:-3] for f in os.listdir(TESTS_DIR) if f.endswith(".py")}
        for name, m in reg.MODULES.items():
            for t in m["tests"]:
                self.assertIn(t, have, f"{name}: test module {t} does not exist")

    def test_frontend_folders_exist(self):
        web = os.path.join(mb.PKG, "..", "..", "web", "src")
        if not os.path.isdir(web):
            self.skipTest("web/ not present")
        for name, m in reg.MODULES.items():
            for f in m["frontend"]:
                self.assertTrue(os.path.isdir(os.path.join(web, f)), f"{name}: frontend folder {f} missing")


def _literal_event_calls():
    """(kind, event, module) for each ``events.publish("x"`` / ``events.subscribe("x"`` call in the sources."""
    out = []
    for rel, full in mb.iter_sources():
        with open(full, encoding="utf-8-sig") as fh:
            tree = ast.parse(fh.read())
        mod = reg.module_of(rel)
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr in ("publish", "subscribe")
                    and isinstance(node.func.value, ast.Name) and node.func.value.id == "events"
                    and node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                out.append((node.func.attr, node.args[0].value, mod, rel))
    return out


class EventContracts(TestCase):
    def test_events_match_the_registry(self):
        calls = _literal_event_calls()
        published, subscribed = {}, {}
        for kind, ev, mod, rel in calls:
            self.assertIn(ev, reg.EVENTS, f"{rel}: event {ev!r} is not declared in module_registry.EVENTS")
            (published if kind == "publish" else subscribed).setdefault(ev, set()).add(mod)
        for ev, spec in reg.EVENTS.items():
            self.assertEqual(published.get(ev, set()), set(spec["publishers"]), f"publishers of {ev}")
            self.assertEqual(subscribed.get(ev, set()), set(spec["subscribers"]), f"subscribers of {ev}")

    def test_handlers_are_wired_at_startup(self):
        for ev in reg.EVENTS:
            self.assertTrue(events.subscribers(ev), f"no handler registered for {ev} (apps.ready)")


class EventDispatcher(SimpleTestCase):
    def test_handler_errors_are_isolated_and_results_returned(self):
        saved = dict(events._handlers)
        try:
            events.clear()
            seen = []
            events.subscribe("t.x", lambda a: seen.append(a))

            def boom(a):
                raise RuntimeError("x")
            events.subscribe("t.x", boom)
            events.subscribe("t.x", lambda a: a * 2)
            with self.assertLogs("bizsuite.events", level="ERROR"):
                res = events.publish("t.x", a=3)
            self.assertEqual(seen, [3])
            self.assertEqual(res, [None, 6])
            with self.assertRaises(RuntimeError), self.assertLogs("bizsuite.events", level="ERROR"):
                events.publish("t.x", strict=True, a=1)
            self.assertEqual(events.publish("t.nobody", a=1), [])
        finally:
            events._handlers.clear()
            events._handlers.update(saved)
