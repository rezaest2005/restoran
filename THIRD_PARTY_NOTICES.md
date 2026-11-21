# Third-party notices

This product includes or adapts small pieces of third-party open-source software.
Each entry lists the source, its license, and where it is used.

## Production

### InvenTree — MIT License
- Source: https://github.com/inventree/InvenTree (`src/backend/InvenTree/part/models.py`, `BomItem.get_required_quantity`)
- Copyright (c) 2017-present InvenTree
- Used in: `dashboard/bizsuite/production_engine.py` → `line_requirement()`
- What was adapted: how the required quantity of a BOM line is computed — base quantity × build
  quantity, then × (1 + attrition %), then + a fixed setup quantity, then rounded up to a rounding
  multiple. Rewritten for `Decimal` and this project's data model.

MIT License text:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Ideas only (no code copied)
These projects are GPL/LGPL/AGPL licensed. Only general concepts, which are standard MRP practice,
were used. No code, schema or text was copied.
- **ERPNext / Frappe** (GPL-3.0): Routing with ordered operations, workstations, an hourly rate and a
  batch size per operation; job cards that must be completed in sequence; a production plan that
  explodes multi-level BOMs into sub-assembly work orders.
- **Odoo MRP** (LGPL-3.0): by-products that take a percentage share of the production cost.
- **Tryton production** (GPL-3.0): BOM inputs and outputs scaled by the production quantity.
- **Grocy** (MIT): recipes that include other recipes (nested BOM), which is the same idea as a
  "semi-finished" item. Only the concept was used.

## Delivery

No third-party source code is copied into the delivery module. The route ordering
(nearest-neighbour + 2-opt on haversine distances), the point-in-polygon zone test, the
signature pad and the reports are our own implementations. The projects below were
consulted for **ideas only**:

| Project | License | What we took (ideas only, no code) |
|---|---|---|
| [VROOM](https://github.com/VROOM-Project/vroom) | BSD-2-Clause | Treating stop ordering as a TSP / VRP with time windows and priorities: urgent stops first, then a local-search improvement; reporting stops that would miss their window. |
| [OSRM](https://github.com/Project-OSRM/osrm-backend) | BSD-2-Clause | Its `trip` service (greedy TSP heuristic): a greedy first order that a local search then improves. We use straight-line distances so no routing server is needed. |
| [Traccar](https://github.com/traccar/traccar) | Apache-2.0 | Geofences (polygon and circle zones) and GPS device pings; the existing `/api/delivery/ping/` endpoint already follows this model. |
| [Fleetbase](https://github.com/fleetbase/fleetbase) | AGPL-3.0 (ideas only, no code) | Proof of delivery by photo / signature / code, service zones, order activity timeline. |
| Odoo `delivery` module | LGPL-3.0 (ideas only, no code) | Zone-based shipping fees with "free over an order amount"; a limited number of delivery attempts before the parcel goes back. |

If code from an MIT / BSD / Apache-licensed project is added to the delivery module later,
add its copyright line and license text here.

## Club

### rfm — MIT License
- Source: https://github.com/sonwanesuresh95/rfm
- Used in: `dashboard/bizsuite/club_analytics.py` (`_quintile_scores`, `rfm_segment`)
- What: the RFM approach (1-5 equal-frequency scores on ranks, i.e. `pd.qcut(rank(method="first"), 5)`)
  and the score → segment table (Champions, Loyal, Promising, Potential loyalist, New active,
  Low spenders, Need attention, About to sleep, At risk, Lost). Re-written in plain Python without pandas.

```
MIT License

Copyright (c) 2022 The Python Packaging Authority

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Saleor — BSD 3-Clause License
- Source: https://github.com/saleor/saleor (`saleor/discount/models.py`, `Voucher`)
- Used in: `dashboard/bizsuite/models/club.py` (`LoyaltyCoupon`), `club_services.validate_coupon`
- What: the voucher field design only (usage limit, once-per-customer limit, start/end date,
  minimum spent, fixed vs percentage value). Implementation is our own.
- Copyright (c) 2020-2022, Saleor Commerce. Redistribution and use permitted under the
  BSD 3-Clause licence: https://github.com/saleor/saleor/blob/main/LICENSE

### Ideas only (no code copied)
- Open Loyalty (licence unclear / commercial): earning-rule types, tier levels with automatic downgrade,
  point expiry per lot.
- Odoo loyalty (LGPL-3 / OPL): rewards catalogue that converts points into a coupon.
- Twenty CRM, SuiteCRM (AGPL-3): customer segments and campaign targeting.
- Craft "Pointz" plugin (licence not stated): lot-based points ledger that expires and reverses correctly.
- Medusa (MIT, ideas only): promotion / campaign separation.

## Dashboard

### InvenTree — MIT License

- Source: https://github.com/inventree/InvenTree (`src/frontend/src/components/dashboard/`)
- License: MIT, Copyright (c) 2017 - InvenTree Developers
- What we took: the *pattern* of a declarative dashboard widget library. Each widget is a plain object
  (key, title, icon, render function) and a widget is shown only when its data / permission requirement is met.
  It was re-implemented from scratch for this codebase in
  `web/src/features/business/dashboard/home/kpiRegistry.js`, `home/KpiWidgets.jsx` and
  `dashboard/bizsuite/dashboard_summary.py` (`BLOCKS`). No source lines were copied.

```
MIT License

Copyright (c) 2017 - InvenTree Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Ideas only (no code)

| Project | License | Idea used |
|---|---|---|
| ERPNext (frappe/erpnext) | GPL-3.0 | Setup-wizard "domains" (Manufacturing, Retail, Distribution, Services...) that decide which modules a company sees → our business-type presets (`dashboard/bizsuite/industries.py`). |
| Frappe Books (frappe/books) | AGPL-3.0 | Short first-run wizard where one choice (country) picks the starter chart of accounts → our preset `coa_template` key and the 3-step setup wizard. |
| Odoo Community | LGPL-3.0 (industry packages: Odoo Enterprise licence) | Onboarding banner / getting-started steps (company data, layout, first document) → our onboarding checklist; industry packages → preset terminology. |
| Akaunting | BSL 1.1 | Home dashboard of KPI widgets (receivables, cash) — reviewed, nothing taken beyond the general concept. |
