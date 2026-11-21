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
