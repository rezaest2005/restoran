"""scripts/test_module.py: every test belongs to a module and the selection follows the dependency table."""
import os
import subprocess
import sys

from django.test import SimpleTestCase

from bizsuite import module_registry as reg

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "test_module.py")


def run(*args):
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, timeout=60)


class ModuleWorkflow(SimpleTestCase):
    def setUp(self):
        if not os.path.isfile(SCRIPT):
            self.skipTest("scripts/ not present")

    def test_check_every_test_file_has_a_module(self):
        r = run("--check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_selection_includes_dependents_but_not_unrelated_modules(self):
        r = run("inventory", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("test_inventory_flow", r.stdout)
        self.assertIn("test_production", r.stdout)       # production depends on inventory
        self.assertNotIn("test_feedback", r.stdout)       # unrelated
        only = run("inventory", "--only", "--dry-run")
        self.assertNotIn("test_production", only.stdout)

    def test_dependents_are_symmetric_with_declared_edges(self):
        for src, dsts in reg.DEPENDS_ON.items():
            for d in dsts:
                self.assertIn(src, reg.dependents(d))

    def test_unknown_module_is_rejected(self):
        self.assertEqual(run("nope", "--dry-run").returncode, 2)
