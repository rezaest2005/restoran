# Third-party notices

This file lists open-source projects whose code or ideas are used in this product, with their licenses.

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
