#!/usr/bin/env python
"""
Run only the tests that matter for a module (standard library only).

  python scripts/test_module.py accounting            module's tests + tests of modules that depend on it
  python scripts/test_module.py accounting --only     just the module's own tests
  python scripts/test_module.py pos club              several modules
  python scripts/test_module.py --changed             modules touched by `git diff --name-only <base>` (+ working tree)
  python scripts/test_module.py --changed --base main
  python scripts/test_module.py --list                list modules with their test files
  python scripts/test_module.py --check               fail when a test file belongs to no module
  add --dry-run to only print the selection, --python PATH to choose the interpreter

The module table (tests per module, allowed dependencies, event partners) lives in
dashboard/bizsuite/module_registry.py; this script never duplicates it.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DASH = os.path.join(ROOT, "dashboard")
sys.path.insert(0, DASH)

from bizsuite import module_registry as reg  # noqa: E402


def test_files() -> list[str]:
    d = os.path.join(DASH, "tests")
    return sorted(f[:-3] for f in os.listdir(d) if f.startswith("test_") and f.endswith(".py"))


def orphans() -> list[str]:
    return [t for t in test_files() if reg.owner_of_test(t) is None]


def tests_for(mods: set[str]) -> list[str]:
    out = []
    for m in sorted(mods):
        out += reg.MODULES[m]["tests"]
        if m == "core":
            out += reg.PLATFORM_TESTS
    have = set(test_files())
    return sorted({t for t in out if t in have})


def module_of_path(path: str):
    """Module for a changed path (repo-relative, forward slashes) or (None, note)."""
    p = path.replace("\\", "/")
    if p.startswith("dashboard/bizsuite/"):
        rel = p[len("dashboard/bizsuite/"):]
        m = reg.module_of(rel)
        return (m, None) if m else (None, f"{p}: not in module_registry (add it)")
    if p.startswith("dashboard/tests/"):
        m = reg.owner_of_test(p)
        return (m, None) if m else (None, f"{p}: test file has no module")
    if p.startswith("web/src/"):
        rel = p[len("web/src/"):]
        best = None
        for name, m in reg.MODULES.items():
            for f in m["frontend"]:
                if rel == f or rel.startswith(f + "/"):
                    if best is None or len(f) > best[1]:
                        best = (name, len(f))
        return (best[0], "frontend only: run npm run lint && npm run build in web/") if best else (None, None)
    return None, None


def changed_modules(base: str, tests_only: set):
    def git(*a):
        r = subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)
        return [x for x in r.stdout.splitlines() if x.strip()]
    files = set(git("diff", "--name-only", f"{base}...HEAD")) or set(git("diff", "--name-only", base))
    files |= set(git("diff", "--name-only", "HEAD")) | set(git("ls-files", "--others", "--exclude-standard"))
    mods, notes = set(), []
    for f in sorted(files):
        m, note = module_of_path(f)
        if m and f.replace("\\", "/").startswith("dashboard/tests/"):
            tests_only.add(m)
        elif m:
            mods.add(m)
        if note:
            notes.append(note)
    return mods, notes, sorted(files)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modules", nargs="*")
    ap.add_argument("--changed", action="store_true")
    ap.add_argument("--base", default="main")
    ap.add_argument("--only", action="store_true", help="skip the tests of dependent modules")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--python", default=sys.executable)
    a = ap.parse_args()

    if a.list:
        for n, m in reg.MODULES.items():
            print(f"{n:14} {m['tier']:9} tests: {', '.join(m['tests']) or '-'}")
        return 0
    if a.check:
        bad = orphans()
        print("every test file belongs to a module" if not bad else "test files without a module: " + ", ".join(bad))
        return 1 if bad else 0

    notes: list[str] = []
    tests_only: set[str] = set()
    if a.changed:
        mods, notes, files = changed_modules(a.base, tests_only)
        print(f"changed files vs {a.base}: {len(files)}")
    else:
        unknown = [m for m in a.modules if m not in reg.MODULES]
        if unknown or not a.modules:
            print("unknown/missing module(s): " + ", ".join(unknown or ["<none>"]) + "\nmodules: " + ", ".join(reg.MODULES))
            return 2
        mods = set(a.modules)
    for n in notes:
        print("note:", n)
    if not mods and not tests_only:
        print("no backend module affected - nothing to run")
        return 0
    selected = set(mods) | tests_only
    if "root" in mods:  # urls/serializers/admin/apps touch everything
        selected |= {m for m in reg.MODULES if reg.tier(m) != reg.ROOT}
    if not a.only:
        for m in mods:
            selected |= reg.dependents(m) if reg.tier(m) != reg.ROOT else set()
    selected = {m for m in selected if m in reg.MODULES and reg.tier(m) != reg.ROOT} | ({"core"} if "core" in mods else set())
    tests = tests_for(selected)
    print("modules touched :", ", ".join(sorted(mods)))
    print("also re-tested  :", ", ".join(sorted(selected - mods)) or "-", "(dependents / event partners)")
    print(f"test files ({len(tests)} of {len(test_files())}):", " ".join(tests))
    if not tests:
        return 0
    if a.dry_run:
        return 0
    t0 = time.time()
    rc = subprocess.call([a.python, "manage.py", "test", *[f"tests.{t}" for t in tests]], cwd=DASH)
    print(f"done in {time.time() - t0:.0f}s (exit {rc})")
    return rc


if __name__ == "__main__":
    sys.exit(main())
