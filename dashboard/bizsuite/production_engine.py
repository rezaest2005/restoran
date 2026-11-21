"""
موتور تولید — فرمول چندسطحی، خط تولید (مراحل)، برنامه‌ریز «چند تا می‌خواهم؟» و تحلیل سبک.

همه‌ی محاسبه‌ها روی یک «گراف» درون‌حافظه‌ای از فرمول‌های فعال یک کسب‌وکار انجام می‌شود
تا برنامه‌ریز و جست‌وجوی «حداکثر قابل تولید» بدون ده‌ها کوئری اجرا شوند.

ایده‌ها (بدون کپی کد مگر جایی که ذکر شده):
- محاسبه‌ی مقدار لازم هر قلم (ضایعات ٪ + مقدار ثابت راه‌اندازی + گرد کردن به مضرب)
  اقتباس از ‎BomItem.get_required_quantity‎ در InvenTree (MIT) — THIRD_PARTY_NOTICES.md
- «سطح پایین» (low-level code) و خالص‌سازی نیاز در برابر موجودی: مفهوم کلاسیک MRP
  (ERPNext Production Plan / Odoo MRP — فقط ایده).
- زمان مرحله = آماده‌سازی + تعداد نوبت × زمان هر نوبت (ظرفیت هر نوبت): مفهوم batch size
  در عملیات ERPNext (فقط ایده). سهم بهای محصول جانبی: مفهوم by-product در Odoo (فقط ایده).
"""

from __future__ import annotations

import math
from collections import defaultdict
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
SIXTY = Decimal("60")
Q3 = Decimal("0.001")
Q2 = Decimal("0.01")


def d(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value in (None, ""):
        return ZERO
    return Decimal(str(value))


# ═══════════════════════════════════════
#  واحدها و تبدیل
# ═══════════════════════════════════════

# واحد → (بُعد، ضریب نسبت به واحد پایه‌ی آن بُعد)
UNIT_FACTORS = {
    "g": ("mass", Decimal("0.001")),
    "kg": ("mass", ONE),
    "ton": ("mass", Decimal("1000")),
    "ml": ("volume", Decimal("0.001")),
    "l": ("volume", ONE),
    "m3": ("volume", Decimal("1000")),
    "cm": ("length", Decimal("0.01")),
    "meter": ("length", ONE),
    "unit": ("count", ONE),
    "piece": ("count", ONE),
    "dozen": ("count", Decimal("12")),
}


def units_compatible(a: str, b: str) -> bool:
    if not a or not b or a == b:
        return True
    fa, fb = UNIT_FACTORS.get(a), UNIT_FACTORS.get(b)
    return bool(fa and fb and fa[0] == fb[0])


def convert(quantity, from_unit: str, to_unit: str) -> Decimal:
    """تبدیل مقدار بین دو واحد هم‌بُعد؛ واحد خالی یا یکسان = بدون تبدیل."""
    q = d(quantity)
    if not from_unit or not to_unit or from_unit == to_unit:
        return q
    fa, fb = UNIT_FACTORS.get(from_unit), UNIT_FACTORS.get(to_unit)
    if not (fa and fb and fa[0] == fb[0]):
        raise ValueError(f"واحد «{from_unit}» به «{to_unit}» تبدیل نمی‌شود.")
    return q * fa[1] / fb[1]


# ═══════════════════════════════════════
#  مقدار لازم یک قلم
# ═══════════════════════════════════════

def line_requirement(base_qty, wastage_percent, setup_quantity, rounding_multiple, scale):
    """
    مقدار لازم یک قلم برای `scale` برابرِ یک دسته (به واحد خود کالا).

    Adapted from InvenTree ``BomItem.get_required_quantity`` (MIT License,
    Copyright (c) 2017-present InvenTree): base × (1 + attrition%) + setup,
    then rounded up to the rounding multiple.
    """
    scale = d(scale)
    if scale <= 0:
        return ZERO
    required = d(base_qty) * scale
    waste = d(wastage_percent)
    if waste > 0:
        required *= ONE + waste / HUNDRED
    setup = d(setup_quantity)
    if setup > 0:
        required += setup
    multiple = d(rounding_multiple)
    if multiple > 0:
        required = (required / multiple).to_integral_value(rounding=ROUND_CEILING) * multiple
    return required.quantize(Q3, rounding=ROUND_HALF_UP)


def stage_minutes(setup_minutes, run_minutes, capacity, batch_size, quantity):
    """زمان یک مرحله برای `quantity` واحد خروجی: آماده‌سازی + نوبت‌ها × زمان هر نوبت."""
    quantity = d(quantity)
    if quantity <= 0:
        return ZERO
    cap = d(capacity) if d(capacity) > 0 else d(batch_size)
    runs = Decimal(math.ceil(quantity / cap)) if cap > 0 else ONE
    return (d(setup_minutes) + runs * d(run_minutes)).quantize(Q2, rounding=ROUND_HALF_UP)


# ═══════════════════════════════════════
#  گراف فرمول‌ها
# ═══════════════════════════════════════

class BomGraph:
    """تصویر درون‌حافظه‌ای فرمول‌های فعال، مواد و موجودی یک کسب‌وکار."""

    def __init__(self, business, warehouse=None, include_formula_ids=()):
        from .inventory_services import get_stock_totals
        from .models import Formula, FormulaByProduct, FormulaLine, FormulaStage, RawMaterial

        self.business = business
        fq = Formula.all_objects.filter(business=business)
        extra = [int(i) for i in include_formula_ids if i]
        if extra:
            from django.db.models import Q
            fq = fq.filter(Q(is_active=True) | Q(pk__in=extra))
        else:
            fq = fq.filter(is_active=True)
        self.formulas = {}
        for f in fq.order_by("id"):
            self.formulas[f.id] = {
                "id": f.id, "name": f.name, "output": f.output_material_id,
                "batch": d(f.output_quantity), "overhead": d(f.overhead_percent),
                "active": f.is_active, "lines": [], "stages": [], "byproducts": [],
            }
        ids = list(self.formulas)
        self.materials = {
            m.id: {"id": m.id, "name": m.name, "unit": m.unit, "price": d(m.price),
                   "type": m.material_type}
            for m in RawMaterial.all_objects.filter(business=business)
        }
        for s in FormulaStage.all_objects.filter(formula_id__in=ids).order_by("sequence", "id"):
            self.formulas[s.formula_id]["stages"].append({
                "id": s.id, "sequence": s.sequence, "name": s.name, "workstation": s.workstation,
                "setup": d(s.setup_minutes), "run": d(s.run_minutes), "capacity": d(s.capacity),
                "rate": d(s.labour_rate) + d(s.overhead_rate),
                "labour_rate": d(s.labour_rate), "overhead_rate": d(s.overhead_rate),
            })
        for l in FormulaLine.all_objects.filter(formula_id__in=ids).order_by("id"):
            mat = self.materials.get(l.material_id, {})
            base = convert(l.quantity, l.unit, mat.get("unit", "")) if l.unit else d(l.quantity)
            self.formulas[l.formula_id]["lines"].append({
                "material": l.material_id, "base": base, "waste": d(l.wastage_percent),
                "setup": d(l.setup_quantity), "rounding": d(l.rounding_multiple),
                "stage": l.stage_id,
            })
        for b in FormulaByProduct.all_objects.filter(formula_id__in=ids).order_by("id"):
            self.formulas[b.formula_id]["byproducts"].append({
                "material": b.material_id, "quantity": d(b.quantity),
                "share": d(b.cost_share_percent),
            })
        # فرمول پیش‌فرض هر ماده = جدیدترین فرمول فعال (هم‌خوان با sub_formula_map)
        self.default_for = {}
        for f in sorted(self.formulas.values(), key=lambda x: -x["id"]):
            if f["active"]:
                self.default_for.setdefault(f["output"], f["id"])
        if warehouse is None:
            self.stock = {k: d(v) for k, v in get_stock_totals(business).items()}
        else:
            self.stock = {k: d(v) for k, v in get_stock_totals(business, warehouse=warehouse).items()}
        self._cost_memo = {}

    # ── helpers ──
    def mat(self, mid):
        return self.materials.get(mid) or {"id": mid, "name": f"#{mid}", "unit": "", "price": ZERO, "type": "raw"}

    def needs(self, fid, quantity):
        """[(material_id, qty, line)] برای تولید `quantity` واحد خروجی فرمول."""
        f = self.formulas[fid]
        scale = d(quantity) / f["batch"]
        return [
            (l["material"], line_requirement(l["base"], l["waste"], l["setup"], l["rounding"], scale), l)
            for l in f["lines"]
        ]

    def stage_plan(self, fid, quantity):
        f = self.formulas[fid]
        out = []
        for s in f["stages"]:
            minutes = stage_minutes(s["setup"], s["run"], s["capacity"], f["batch"], quantity)
            cost = (minutes / SIXTY * s["rate"]).quantize(Q2, rounding=ROUND_HALF_UP)
            out.append({**s, "minutes": minutes, "cost": cost})
        return out

    def unit_cost_of_material(self, mid, chosen=None, _path=()):
        fid = (chosen or {}).get(mid) or self.default_for.get(mid)
        if fid and fid in self.formulas:
            return self.formula_cost(fid, _path=_path)["unit_cost"]
        return self.mat(mid)["price"]

    def formula_cost(self, fid, quantity=None, _path=()):
        """بهای استاندارد (بازگشتی؛ نیمه‌آماده‌ها با بهای فرمول خودشان)."""
        f = self.formulas[fid]
        qty = d(quantity) if quantity is not None else f["batch"]
        key = (fid, qty)
        if key in self._cost_memo:
            return self._cost_memo[key]
        if fid in _path:
            raise ValueError("چرخه در فرمول‌ها: " + " → ".join(self.formulas[x]["name"] for x in (*_path, fid)))
        path = (*_path, fid)
        lines = []
        material = ZERO
        for mid, need, _l in self.needs(fid, qty):
            uc = self.unit_cost_of_material(mid, _path=path)
            cost = need * uc
            material += cost
            m = self.mat(mid)
            lines.append({"material_id": mid, "material": m["name"], "unit": m["unit"],
                          "type": m["type"], "quantity": need, "unit_cost": uc, "cost": cost,
                          "has_formula": mid in self.default_for})
        stages = self.stage_plan(fid, qty)
        operation = sum((s["cost"] for s in stages), ZERO)
        overhead = material * f["overhead"] / HUNDRED
        gross = material + operation + overhead
        share = sum((b["share"] for b in f["byproducts"]), ZERO)
        credit = gross * share / HUNDRED
        net = gross - credit
        result = {
            "quantity": qty, "material_cost": material, "operation_cost": operation,
            "overhead_cost": overhead, "byproduct_credit": credit, "total_cost": net,
            "unit_cost": (net / qty) if qty > 0 else ZERO,
            "lines": lines, "stages": stages,
            "minutes": sum((s["minutes"] for s in stages), ZERO),
        }
        self._cost_memo[key] = result
        return result

    # ── چرخه ──
    def find_cycle(self, output_mid, input_mids, own_fid=None):
        """
        اگر یکی از ورودی‌ها (مستقیم یا از راه فرمول نیمه‌آماده‌ها) به خروجی برسد،
        مسیر چرخه را برمی‌گرداند؛ وگرنه None.
        """
        stack = [(m, (m,)) for m in input_mids]
        seen = set()
        while stack:
            mid, path = stack.pop()
            if mid == output_mid:
                return path
            if mid in seen:
                continue
            seen.add(mid)
            fid = self.default_for.get(mid)
            if fid is None or fid == own_fid:
                continue
            for l in self.formulas[fid]["lines"]:
                stack.append((l["material"], (*path, l["material"])))
        return None

    def cycle_message(self, output_mid, path):
        names = [self.mat(output_mid)["name"], *(self.mat(m)["name"] for m in path)]
        return "چرخه در فرمول: " + " ← ".join(names) + " (یک کالا نمی‌تواند، مستقیم یا غیرمستقیم، ورودی خودش باشد)."

    # ── برنامه‌ریز ──
    def _levels(self, roots, chosen):
        """سطح پایین هر ماده (طولانی‌ترین فاصله از هدف‌ها) + تشخیص چرخه."""
        color = {}
        order = []
        edges = defaultdict(set)

        def visit(mid, path):
            state = color.get(mid)
            if state == 1:
                cyc = path[path.index(mid):] + [mid]
                raise ValueError("چرخه در فرمول‌ها: " + " ← ".join(self.mat(m)["name"] for m in cyc))
            if state == 2:
                return
            color[mid] = 1
            fid = chosen.get(mid)
            if fid is not None:
                for l in self.formulas[fid]["lines"]:
                    edges[mid].add(l["material"])
                    visit(l["material"], path + [mid])
            color[mid] = 2
            order.append(mid)

        for r in roots:
            visit(r, [])
        level = {m: 0 for m in order}
        for mid in reversed(order):  # ترتیب توپولوژیک: والدها پیش از فرزندها
            for c in edges[mid]:
                level[c] = max(level[c], level[mid] + 1)
        return level

    def plan(self, targets, use_stock=True):
        """
        targets: [(formula_id, quantity)]
        خروجی: مواد لازم/کسری، نیمه‌آماده‌هایی که اول باید ساخته شوند (به ترتیب)،
        زمان هر مرحله و بهای تمام‌شده.
        """
        chosen = dict(self.default_for)
        target_qty = defaultdict(lambda: ZERO)
        roots = []
        for fid, qty in targets:
            if fid not in self.formulas:
                raise ValueError("فرمول پیدا نشد.")
            out = self.formulas[fid]["output"]
            chosen[out] = fid
            target_qty[out] += d(qty)
            roots.append(out)
        level = self._levels(roots, chosen)
        demand = defaultdict(lambda: ZERO)
        for mid, q in target_qty.items():
            demand[mid] += q
        avail = dict(self.stock) if use_stock else {}

        makes, buys = [], []
        for mid in sorted(level, key=lambda m: (level[m], m)):
            need = demand[mid]
            if need <= 0:
                continue
            m = self.mat(mid)
            fid = chosen.get(mid)
            have = avail.get(mid, ZERO)
            if fid is not None:
                tq = target_qty.get(mid, ZERO)
                rest = max(need - tq, ZERO)
                from_stock = min(max(have, ZERO), rest)
                avail[mid] = have - from_stock
                make = tq + rest - from_stock
                if make <= 0:
                    makes.append({"formula_id": fid, "material_id": mid, "quantity": ZERO,
                                  "from_stock": from_stock, "level": level[mid]})
                    continue
                for cid, cq, _l in self.needs(fid, make):
                    demand[cid] += cq
                makes.append({"formula_id": fid, "material_id": mid, "quantity": make,
                              "from_stock": from_stock, "level": level[mid]})
            else:
                shortage = max(need - max(have, ZERO), ZERO)
                buys.append({"material_id": mid, "required": need, "available": max(have, ZERO),
                             "shortage": shortage})

        # ── خروجی خوانا ──
        materials = []
        for b in buys:
            m = self.mat(b["material_id"])
            materials.append({
                **b, "material": m["name"], "unit": m["unit"], "type": m["type"],
                "unit_price": m["price"], "shortage_cost": b["shortage"] * m["price"],
            })
        materials.sort(key=lambda x: (-(x["shortage"] > 0), x["material"]))

        steps = []
        stage_load = defaultdict(lambda: ZERO)
        total_minutes = ZERO
        for mk in sorted(makes, key=lambda x: (-x["level"], x["material_id"])):
            f = self.formulas[mk["formula_id"]]
            m = self.mat(mk["material_id"])
            stages = self.stage_plan(f["id"], mk["quantity"]) if mk["quantity"] > 0 else []
            minutes = sum((s["minutes"] for s in stages), ZERO)
            total_minutes += minutes
            for s in stages:
                stage_load[(s["workstation"] or s["name"])] += s["minutes"]
            cost = self.formula_cost(f["id"], mk["quantity"]) if mk["quantity"] > 0 else None
            steps.append({
                "formula_id": f["id"], "formula": f["name"], "material_id": m["id"],
                "material": m["name"], "unit": m["unit"], "type": m["type"],
                "quantity": mk["quantity"], "from_stock": mk["from_stock"],
                "level": mk["level"], "is_target": mk["material_id"] in target_qty,
                "minutes": minutes,
                "stages": [{"name": s["name"], "workstation": s["workstation"],
                            "minutes": s["minutes"], "cost": s["cost"]} for s in stages],
                "total_cost": cost["total_cost"] if cost else ZERO,
            })

        target_rows = []
        total_cost = ZERO
        for fid, qty in targets:
            c = self.formula_cost(fid, qty)
            total_cost += c["total_cost"]
            f = self.formulas[fid]
            m = self.mat(f["output"])
            target_rows.append({
                "formula_id": fid, "formula": f["name"], "material": m["name"], "unit": m["unit"],
                "quantity": d(qty), "unit_cost": c["unit_cost"], "total_cost": c["total_cost"],
                "material_cost": c["material_cost"], "operation_cost": c["operation_cost"],
                "overhead_cost": c["overhead_cost"], "byproduct_credit": c["byproduct_credit"],
            })
        bottleneck = None
        if stage_load:
            name, mins = max(stage_load.items(), key=lambda kv: kv[1])
            if mins > 0:
                bottleneck = {"name": name, "minutes": mins}
        shortages = [x for x in materials if x["shortage"] > 0]
        return {
            "targets": target_rows,
            "materials": materials,
            "purchase_list": shortages,
            "purchase_cost": sum((x["shortage_cost"] for x in shortages), ZERO),
            "make_steps": [s for s in steps if s["quantity"] > 0],
            "from_stock": [
                {"material_id": s["material_id"], "material": s["material"], "unit": s["unit"],
                 "quantity": s["from_stock"]}
                for s in steps if s["from_stock"] > 0
            ],
            "total_minutes": total_minutes,
            "total_cost": total_cost,
            "bottleneck": bottleneck,
            "can_produce": not shortages,
        }

    def feasible(self, fid, qty):
        return self.plan([(fid, qty)], use_stock=True)["can_produce"]

    def max_producible(self, fid, limit=10_000_000):
        """بیشترین تعداد «واحد کامل» قابل تولید از موجودی فعلی (شامل ساخت نیمه‌آماده‌ها)."""
        f = self.formulas[fid]
        if not f["lines"]:
            return None
        if not self.feasible(fid, ONE):
            return ZERO
        lo, hi = 1, 2
        while hi <= limit and self.feasible(fid, Decimal(hi)):
            lo, hi = hi, hi * 2
        if hi > limit:
            return Decimal(limit)
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.feasible(fid, Decimal(mid)):
                lo = mid
            else:
                hi = mid
        return Decimal(lo)


# ═══════════════════════════════════════
#  تحلیل سبک یک فرمول
# ═══════════════════════════════════════

def formula_analysis(business, formula):
    from .models import Food, ProductionOrder

    g = BomGraph(business, include_formula_ids=[formula.id])
    c = g.formula_cost(formula.id)
    total = c["total_cost"] or ZERO
    gross = c["material_cost"] + c["operation_cost"] + c["overhead_cost"]
    mats = sorted(c["lines"], key=lambda x: -x["cost"])
    for m in mats:
        m["share_percent"] = (m["cost"] / gross * HUNDRED) if gross > 0 else ZERO
    stages = c["stages"]
    bottleneck = max(stages, key=lambda s: s["minutes"]) if stages else None
    if bottleneck is not None and bottleneck["minutes"] <= 0:
        bottleneck = None

    products = list(
        Food.all_objects.filter(business=business, item_id=formula.output_material_id)
        .values("id", "name", "price", "final_price")
    )
    price = ZERO
    for p in products:
        p_price = d(p["final_price"]) or d(p["price"])
        if p_price > 0:
            price = p_price
            break
    unit_cost = c["unit_cost"]
    margin = price - unit_cost if price > 0 else None

    done = ProductionOrder.all_objects.filter(
        business=business, formula=formula, status=ProductionOrder.Status.COMPLETED
    ).values_list("planned_quantity", "produced_quantity", "scrap_quantity", "unit_cost")
    planned = produced = scrap = cost_sum = ZERO
    n = 0
    for pq, prq, sq, uc in done:
        planned += d(pq)
        produced += d(prq)
        scrap += d(sq)
        cost_sum += d(uc) * d(prq)
        n += 1
    history = {
        "orders": n,
        "planned": planned,
        "produced": produced,
        "scrap": scrap,
        "yield_percent": (produced / planned * HUNDRED) if planned > 0 else None,
        "scrap_percent": (scrap / (produced + scrap) * HUNDRED) if (produced + scrap) > 0 else None,
        "avg_actual_unit_cost": (cost_sum / produced) if produced > 0 else None,
    }
    try:
        max_qty = g.max_producible(formula.id) if formula.id in g.formulas else None
    except ValueError:
        max_qty = None
    return {
        "batch_quantity": c["quantity"],
        "material_cost": c["material_cost"],
        "operation_cost": c["operation_cost"],
        "overhead_cost": c["overhead_cost"],
        "byproduct_credit": c["byproduct_credit"],
        "total_cost": total,
        "unit_cost": unit_cost,
        "minutes_per_batch": c["minutes"],
        "materials": mats,
        "stages": stages,
        "bottleneck": ({"name": bottleneck["name"], "workstation": bottleneck["workstation"],
                        "minutes": bottleneck["minutes"]} if bottleneck else None),
        "selling_price": price if price > 0 else None,
        "margin": margin,
        "margin_percent": (margin / price * HUNDRED) if margin is not None and price > 0 else None,
        "products": [{"id": p["id"], "name": p["name"], "price": d(p["final_price"]) or d(p["price"])}
                     for p in products],
        "history": history,
        "max_producible": max_qty,
    }


def to_json(obj):
    """Decimal → float (بازگشتی) برای پاسخ API."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: to_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_json(v) for v in obj]
    return obj
