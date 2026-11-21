"""
Route ordering and delivery zones — pure functions, no database, no external service.

Route ordering (our own deterministic implementation; ideas only from the literature
and from VROOM / OSRM docs, no code copied):
  1. stops are split into priority tiers (urgent → high → normal) so an urgent parcel
     is never pushed behind normal ones (``_tiers``);
  2. each tier is ordered by nearest-neighbour from the current position;
  3. the order is improved with 2-opt (reverse a segment when that shortens the path)
     until no improving move is left or the pass limit is reached.
Distances are great-circle (haversine) km — good enough to order 2–100 stops in a city
and works without a routing server.  Ties are broken by the input index, so the same
input always gives the same answer.

Zones: a point is inside a polygon zone (ray casting) or a circle zone (haversine ≤ radius).
"""

from __future__ import annotations

import math

EARTH_RADIUS_KM = 6371.0088
MAX_2OPT_PASSES = 50
EPS = 1e-9


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = p2 - p1
    dl = math.radians(float(lng2) - float(lng1))
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def path_km(points, start=None) -> float:
    """Length of an open path start → p0 → p1 → … (start optional)."""
    seq = ([start] if start is not None else []) + list(points)
    return sum(haversine_km(a[0], a[1], b[0], b[1]) for a, b in zip(seq, seq[1:]))


def _nearest_neighbour(points, idx, start):
    """Greedy order of ``idx`` (indices into points) from ``start`` (or from the first index)."""
    left = list(idx)
    out = []
    cur = start
    if cur is None and left:
        first = left.pop(0)
        out.append(first)
        cur = points[first]
    while left:
        best = min(left, key=lambda i: (haversine_km(cur[0], cur[1], points[i][0], points[i][1]), i))
        left.remove(best)
        out.append(best)
        cur = points[best]
    return out


def _two_opt(points, order, start):
    """Improve an open path with 2-opt. ``start`` (fixed, not part of order) may be None."""
    if len(order) < 3 and start is None:
        return order
    route = list(order)
    node = (lambda k: start if k < 0 else points[route[k]])
    d = haversine_km
    n = len(route)
    for _ in range(MAX_2OPT_PASSES):
        improved = False
        # i: first index of the reversed segment; it may be 0 only when there is a fixed start
        for i in range(0 if start is not None else 1, n - 1):
            a = node(i - 1)
            b = node(i)
            for j in range(i + 1, n):
                c = node(j)
                before = d(a[0], a[1], b[0], b[1])
                after = d(a[0], a[1], c[0], c[1])
                if j + 1 < n:
                    e = node(j + 1)
                    before += d(c[0], c[1], e[0], e[1])
                    after += d(b[0], b[1], e[0], e[1])
                if after < before - EPS:
                    route[i:j + 1] = reversed(route[i:j + 1])
                    improved = True
                    b = node(i)
        if not improved:
            break
    return route


def _tiers(stops):
    """Group stop indices by priority (high first), keeping input order inside a group."""
    groups = {}
    for i, s in enumerate(stops):
        groups.setdefault(-int(s.get("priority") or 0), []).append(i)
    return [groups[k] for k in sorted(groups)]


def optimize_order(stops, start=None):
    """
    stops: [{"lat", "lng", "priority"?}] (lat/lng may be None — those keep their relative order at the end).
    start: (lat, lng) of the courier / depot, or None.
    Returns (order, km_before, km_after) — order is a list of input indices.
    """
    located = [i for i, s in enumerate(stops) if s.get("lat") is not None and s.get("lng") is not None]
    located_set = set(located)
    unlocated = [i for i in range(len(stops)) if i not in located_set]
    pts = {i: (float(stops[i]["lat"]), float(stops[i]["lng"])) for i in located}
    start = (float(start[0]), float(start[1])) if start is not None else None

    order = []
    cur = start
    for tier in _tiers([stops[i] for i in located]):
        idx = [located[k] for k in tier]
        part = _nearest_neighbour(pts, idx, cur)
        part = _two_opt(pts, part, cur)
        order.extend(part)
        if part:
            cur = pts[part[-1]]
    km_before = path_km([pts[i] for i in located], start)
    km_after = path_km([pts[i] for i in order], start)
    if km_after > km_before + EPS and len(_tiers([stops[i] for i in located])) <= 1:
        order, km_after = list(located), km_before     # never return something worse than the input
    return order + unlocated, round(km_before, 2), round(km_after, 2)


def schedule(points, start, depart_at, speed_kmh=25.0, service_minutes=5, detour=1.3):
    """Estimated arrival per point along an ordered path (straight line × detour ÷ speed + service time)."""
    from datetime import timedelta
    out, cur, t = [], start, depart_at
    for p in points:
        if p is None:
            out.append(None)
            continue
        if cur is not None:
            t = t + timedelta(minutes=haversine_km(cur[0], cur[1], p[0], p[1]) * detour / speed_kmh * 60)
        out.append(t)
        t = t + timedelta(minutes=service_minutes)
        cur = p
    return out


# ═══════════════════════════════════════
#  zones
# ═══════════════════════════════════════

def point_in_polygon(lat, lng, polygon) -> bool:
    """Ray casting on [[lat, lng], ...] (closed or open ring). Points on an edge count as inside."""
    if not polygon or len(polygon) < 3:
        return False
    x, y = float(lng), float(lat)
    inside = False
    n = len(polygon)
    for k in range(n):
        y1, x1 = float(polygon[k][0]), float(polygon[k][1])
        y2, x2 = float(polygon[(k + 1) % n][0]), float(polygon[(k + 1) % n][1])
        # on the edge
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if abs(cross) < 1e-12 and min(x1, x2) - EPS <= x <= max(x1, x2) + EPS and min(y1, y2) - EPS <= y <= max(y1, y2) + EPS:
            return True
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                inside = not inside
    return inside


def validate_polygon(raw):
    """[[lat, lng], ...] with 3..200 valid points → list of [float, float]; raises ValueError."""
    if raw in (None, "", []):
        return []
    if not isinstance(raw, list) or not (3 <= len(raw) <= 200):
        raise ValueError("چندضلعی باید بین ۳ تا ۲۰۰ نقطه داشته باشد.")
    out = []
    for p in raw:
        try:
            lat, lng = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError, KeyError):
            raise ValueError("نقطه‌ی چندضلعی نامعتبر است.")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError("نقطه‌ی چندضلعی خارج از محدوده است.")
        out.append([round(lat, 6), round(lng, 6)])
    return out


def zone_contains(zone, lat, lng) -> bool:
    """zone: object or dict with polygon / center_lat / center_lng / radius_km."""
    get = (lambda k: zone.get(k)) if isinstance(zone, dict) else (lambda k: getattr(zone, k, None))
    poly = get("polygon")
    if poly:
        return point_in_polygon(lat, lng, poly)
    clat, clng, radius = get("center_lat"), get("center_lng"), get("radius_km")
    if clat is None or clng is None or radius is None:
        return False
    return haversine_km(clat, clng, lat, lng) <= float(radius) + EPS
