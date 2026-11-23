#!/usr/bin/env python
"""
Regenerate docs/modules/<module>.md (one card per module) from dashboard/bizsuite/module_registry.py.
Standard library only. Edit the hand-written notes in NOTES below, never the generated cards.

  python scripts/gen_module_cards.py
"""
from __future__ import annotations

import ast
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "dashboard"))

from bizsuite import module_boundaries as mb, module_registry as reg  # noqa: E402

NOTES = {
    "core": ("Tenant resolution (every query is scoped to the current business), JWT/cookie middleware, background "
             "jobs, industry presets, shared helpers and the event dispatcher (events.py).",
             "industries.py still reads accounting chart templates directly (one baseline entry)."),
    "users": ("Accounts, owner/employee roles, per-user feature (tab) permissions, login/session payloads, staff "
              "management.",
              "Courier/driver profiles are created by the users views through delivery's transport_services (9 "
              "baseline entries): needs a user-saved event or a delivery-side hook."),
    "licensing": ("Which modules/features a business may use: catalogue, plans, subscription windows, feature keys.", "-"),
    "activity": ("Append-only audit trail (`audit` decorator, `log`) and its API.",
                 "views/activity.py reads delivery Driver rows for the driver filter."),
    "superadmin": ("The platform operator console: tenants, users, prices, stats.", "-"),
    "catalog": ("Products (Food/Category) with stock links, barcodes and section price lists; product stock helpers.",
                "Reads inventory/production models for stock links. Product models live in core (models/menu.py) "
                "because every sales module needs them."),
    "pos": ("Cashier: orders, payments, reports, online orders, day close.",
            "Calls inventory stock functions directly (declared edge, public services). The orders table is read "
            "directly by accounting, club, delivery, qr, card_terminal and dashboard (see backlog)."),
    "inventory": ("Warehouses, stock, receiving/issue/waste, suppliers, purchase and sales invoicing, returns, expenses.",
                  "models/sales.py reaches into accounting Payment and delivery TripStop for customer balances."),
    "production": ("Formulas/recipes, production orders, stages and by-products; consumes and produces stock.",
                   "Reads inventory RawMaterial/Warehouse models directly; production completion does not post "
                   "accounting entries (nothing to decouple yet)."),
    "accounting": ("Double-entry ledger, auto-posting from events, treasury, cheques, budgets, fiscal years, reports.",
                   "Reads source documents of inventory/pos by ORM because posting needs the invoice lines."),
    "delivery": ("Trips, stops, drivers, carriers, zones, tracking links, cash settlement, routing.",
                 "Reads Order and invoice models directly; posts ledger entries through accounting's public ledger "
                 "API (accounting_services)."),
    "club": ("Loyalty: members, tiers, points, rewards, coupons, wallet, campaigns, messages.",
             "Reads order items / sales invoice items to compute category bonuses."),
    "feedback": ("Customer feedback forms and answers.", "-"),
    "qr": ("QR short links for tables/menus and the public QR ordering endpoint.",
           "qr_order creates Order/OrderItem rows directly."),
    "card_terminal": ("Card terminal (POS device) payment attempts, bridge protocol, receipts.",
                      "Reads Order/OrderItem directly; reaches dispatch/accounting/club only through events."),
    "support": ("Support tickets between a business and the platform operator.", "-"),
    "dashboard": ("Read-only aggregation of blocks for the modules the business has.",
                  "Queries other modules' models directly: each module should contribute its own block."),
}


def model_tables(name):
    out = []
    for f in reg.MODULES[name]["files"]:
        if f.startswith("models/") and f.endswith(".py"):
            tree = ast.parse(open(os.path.join(ROOT, "dashboard", "bizsuite", f), encoding="utf-8-sig").read())
            for n in tree.body:
                if not isinstance(n, ast.ClassDef) or n.name.endswith("Encoder"):
                    continue
                if not any(isinstance(b, ast.Attribute) or (isinstance(b, ast.Name) and b.id.endswith(("Model", "Base")))
                           or (isinstance(b, ast.Name) and b.id in ("AbstractUser",)) for b in n.bases):
                    continue
                table = f"bizsuite_{n.name.lower()}"
                for sub in ast.walk(n):
                    if isinstance(sub, ast.Assign) and any(getattr(t, "id", "") == "db_table" for t in sub.targets):
                        table = getattr(sub.value, "value", table)
                out.append((n.name, table))
    return out


def endpoints(name):
    src = open(os.path.join(ROOT, "dashboard", "bizsuite", "urls.py"), encoding="utf-8-sig").read()
    paths = re.findall(r'(?:re_)?path\(\s*r?"([^"]*)"', src)
    prefixes = sorted(((pre, m) for m, pl in reg.URLS.items() for pre in pl), key=lambda x: -len(x[0]))
    mine = []
    for pth in paths:
        for pre, m in prefixes:
            if pth.startswith(pre):
                if m == name:
                    mine.append(pth)
                break
    return mine


def main():
    out_dir = os.path.join(ROOT, "docs", "modules")
    os.makedirs(out_dir, exist_ok=True)
    cur, _ = mb.collect()
    for name, m in reg.MODULES.items():
        if reg.tier(name) == reg.ROOT:
            continue
        purpose, issues = NOTES.get(name, ("-", "-"))
        viol: dict[str, int] = {}
        for _f, s_, d, _k, _t in cur:
            if s_ == name:
                viol[d] = viol.get(d, 0) + 1
        pub = [e for e, spec in reg.EVENTS.items() if name in spec["publishers"]]
        con = [e for e, spec in reg.EVENTS.items() if name in spec["subscribers"]]
        tabs = model_tables(name)
        eps = endpoints(name)
        no_api = ("- none (core modules are imported freely; no business API)" if m["tier"] == "core"
                  else "- none (reached only through events / HTTP)")
        L = [f"# {name} - {m['title_en']}", "", m["title_fa"], "",
             "> Generated by `python scripts/gen_module_cards.py` from `bizsuite/module_registry.py`; "
             "edit the notes in the generator, not this file.", "",
             f"**Tier:** {m['tier']}", "", "## Purpose", purpose, "", "## Owned files (bizsuite/)"]
        L += [f"- `{f}`" for f in m["files"]]
        L += ["", "## Public interface (the only files other modules may import)"]
        L += [f"- `{f}`" for f in m["public_api"]] or [no_api]
        L += ["", "## Models / tables"] + ([f"- `{n}` -> `{t}`" for n, t in tabs] or ["- none"])
        L += ["", f"## Endpoints ({len(eps)})"]
        L += [f"- `/{e}`" for e in eps[:12]] or ["- none"]
        if len(eps) > 12:
            L.append(f"- ... {len(eps) - 12} more in urls.py")
        L += ["", "## Events", "Publishes: " + (", ".join(f"`{e}`" for e in pub) or "-"),
              "", "Consumes: " + (", ".join(f"`{e}`" for e in con) or "-")]
        L += ["", "## Dependencies", "Core: always allowed.", "",
              "Declared business modules: " + (", ".join(reg.DEPENDS_ON.get(name, [])) or "-"), "",
              "Re-tested together with it (dependents / event partners): "
              + (", ".join(sorted(reg.dependents(name))) if m["tier"] != "core" else "every module (core change)")]
        L += ["", "## Frontend", *([f"- `web/src/{f}`" for f in m["frontend"]] or ["- none"])]
        L += ["", "## Test it alone", "```",
              f"python scripts/test_module.py {name} --only   # this module's tests",
              f"python scripts/test_module.py {name}          # + dependents", "```",
              "Test files: " + (", ".join(f"`{t}`" for t in m["tests"]) or "-"), "",
              "## Known issues / open boundary violations", issues, "",
              "Baseline violations leaving this module: "
              + (", ".join(f"{d} ({n})" for d, n in sorted(viol.items())) or "none")]
        with open(os.path.join(out_dir, f"{name}.md"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(L) + "\n")
    print("cards written")


if __name__ == "__main__":
    main()
