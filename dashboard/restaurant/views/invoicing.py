"""
Invoicing API — فاکتور فروش، مشتری، مرجوعی، هزینه، سود و زیان
"""

from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ..models import (
    Customer,
    Expense,
    PurchaseInvoice,
    PurchaseReturn,
    SalesInvoice,
    SalesInvoiceItem,
    SalesReturn,
)


# ═══════════════════════════════════════
#  Customer — مشتریان
# ═══════════════════════════════════════


@require_http_methods(["GET", "POST"])
def customer_list_create(request):
    if request.method == "GET":
        qs = Customer.objects.all()
        q = request.GET.get("q")
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(name__icontains=q) | Q(phone__icontains=q))
        data = [
            {
                "id": c.pk,
                "name": c.name,
                "phone": c.phone,
                "address": c.address,
                "opening_balance": c.opening_balance,
                "note": c.note,
                "is_active": c.is_active,
                "total_debt": c.total_debt,
            }
            for c in qs
        ]
        return JsonResponse({"results": data})

    # POST — ایجاد مشتری
    import json
    d = json.loads(request.body)
    c = Customer.objects.create(
        name=d.get("name", ""),
        phone=d.get("phone", ""),
        address=d.get("address", ""),
        opening_balance=d.get("opening_balance", 0),
        note=d.get("note", ""),
    )
    return JsonResponse({"id": c.pk}, status=201)


@require_http_methods(["GET", "PUT", "DELETE"])
def customer_detail(request, pk):
    try:
        c = Customer.objects.get(pk=pk)
    except Customer.DoesNotExist:
        return JsonResponse({"detail": "یافت نشد"}, status=404)

    if request.method == "DELETE":
        c.delete()
        return JsonResponse({}, status=204)

    if request.method == "PUT":
        import json
        d = json.loads(request.body)
        for f in ("name", "phone", "address", "opening_balance", "note", "is_active"):
            if f in d:
                setattr(c, f, d[f])
        c.save()

    return JsonResponse({
        "id": c.pk,
        "name": c.name,
        "phone": c.phone,
        "address": c.address,
        "opening_balance": c.opening_balance,
        "note": c.note,
        "is_active": c.is_active,
        "total_debt": c.total_debt,
    })


# ═══════════════════════════════════════
#  SalesInvoice — فاکتور فروش
# ═══════════════════════════════════════


@require_http_methods(["GET", "POST"])
def sales_invoice_list_create(request):
    if request.method == "GET":
        qs = SalesInvoice.objects.prefetch_related("items", "returns")
        if request.GET.get("from"):
            qs = qs.filter(date__gte=request.GET["from"])
        if request.GET.get("to"):
            qs = qs.filter(date__lte=request.GET["to"])
        if request.GET.get("payment_method"):
            qs = qs.filter(payment_method=request.GET["payment_method"])
        if request.GET.get("customer"):
            qs = qs.filter(customer_id=request.GET["customer"])
        data = [_invoice_dict(i) for i in qs[:200]]
        return JsonResponse({"results": data})

    # POST — ایجاد فاکتور فروش
    import json
    d = json.loads(request.body)
    items = d.get("items", [])
    if not items:
        return JsonResponse({"detail": "حداقل یک قلم الزامی است."}, status=400)

    with transaction.atomic():
        total = sum(
            Decimal(str(i.get("quantity", 0))) * Decimal(str(i.get("unit_price", 0)))
            - Decimal(str(i.get("discount", 0)))
            for i in items
        )
        inv = SalesInvoice.objects.create(
            customer_id=d.get("customer") or None,
            customer_name=d.get("customer_name", ""),
            invoice_number=d.get("invoice_number", ""),
            date=d.get("date", timezone.localdate()),
            payment_method=d.get("payment_method", "cash"),
            total=total,
            discount=d.get("discount", 0),
            paid_amount=d.get("paid_amount", total),
            description=d.get("description", ""),
            created_by=request.user if request.user.is_authenticated else None,
        )
        for i in items:
            SalesInvoiceItem.objects.create(
                invoice=inv,
                item_name=i.get("item_name", ""),
                quantity=i.get("quantity", 0),
                unit=i.get("unit", "unit"),
                unit_price=i.get("unit_price", 0),
                cost_price=i.get("cost_price", 0),
                discount=i.get("discount", 0),
            )
    return JsonResponse(_invoice_dict(inv, detail=True), status=201)


@require_http_methods(["GET", "PUT", "DELETE"])
def sales_invoice_detail(request, pk):
    try:
        inv = SalesInvoice.objects.prefetch_related("items", "returns").get(pk=pk)
    except SalesInvoice.DoesNotExist:
        return JsonResponse({"detail": "یافت نشد"}, status=404)

    if request.method == "DELETE":
        inv.delete()
        return JsonResponse({}, status=204)

    if request.method == "PUT":
        import json
        d = json.loads(request.body)
        items = d.get("items")
        if items is not None:
            with transaction.atomic():
                inv.items.all().delete()
                total = sum(
                    Decimal(str(i.get("quantity", 0))) * Decimal(str(i.get("unit_price", 0)))
                    - Decimal(str(i.get("discount", 0)))
                    for i in items
                )
                inv.total = total
                for i in items:
                    SalesInvoiceItem.objects.create(
                        invoice=inv,
                        item_name=i.get("item_name", ""),
                        quantity=i.get("quantity", 0),
                        unit=i.get("unit", "unit"),
                        unit_price=i.get("unit_price", 0),
                        cost_price=i.get("cost_price", 0),
                        discount=i.get("discount", 0),
                    )
        for f in ("customer", "customer_name", "invoice_number", "date",
                  "payment_method", "discount", "paid_amount", "description"):
            if f in d:
                setattr(inv, f, d[f])
        inv.save()

    return JsonResponse(_invoice_dict(inv, detail=True))


def _invoice_dict(inv, detail=False):
    d = {
        "id": inv.pk,
        "invoice_number": inv.invoice_number,
        "customer": inv.customer_id,
        "customer_name": inv.customer_name,
        "date": str(inv.date),
        "payment_method": inv.payment_method,
        "total": str(inv.total),
        "discount": str(inv.discount),
        "net_total": str(inv.net_total),
        "paid_amount": str(inv.paid_amount),
        "remaining": str(inv.remaining),
        "description": inv.description,
    }
    if detail:
        d["items"] = [
            {
                "id": i.pk,
                "item_name": i.item_name,
                "quantity": str(i.quantity),
                "unit": i.unit,
                "unit_price": str(i.unit_price),
                "cost_price": str(i.cost_price),
                "discount": str(i.discount),
                "line_total": str(i.line_total),
                "profit": str(i.profit),
            }
            for i in inv.items.all()
        ]
        d["total_profit"] = str(inv.total_profit)
        d["returns"] = [
            {"id": r.pk, "item_name": r.item_name, "amount": str(r.amount), "date": str(r.date)}
            for r in inv.returns.all()
        ]
    return d


# ═══════════════════════════════════════
#  Returns — مرجوعی‌ها
# ═══════════════════════════════════════


@require_http_methods(["GET", "POST"])
def sales_return_list_create(request):
    if request.method == "GET":
        qs = SalesReturn.objects.select_related("invoice")[:200]
        return JsonResponse({"results": [
            {
                "id": r.pk,
                "invoice": r.invoice_id,
                "invoice_number": r.invoice.invoice_number,
                "item_name": r.item_name,
                "quantity": str(r.quantity),
                "unit": r.unit,
                "amount": str(r.amount),
                "reason": r.reason,
                "date": str(r.date),
            }
            for r in qs
        ]})

    import json
    d = json.loads(request.body)
    r = SalesReturn.objects.create(
        invoice_id=d.get("invoice"),
        item_name=d.get("item_name", ""),
        quantity=d.get("quantity", 0),
        unit=d.get("unit", "unit"),
        amount=d.get("amount", 0),
        reason=d.get("reason", ""),
        date=d.get("date", timezone.localdate()),
    )
    return JsonResponse({"id": r.pk}, status=201)


@require_http_methods(["DELETE"])
def sales_return_delete(request, pk):
    SalesReturn.objects.filter(pk=pk).delete()
    return JsonResponse({}, status=204)


@require_http_methods(["GET", "POST"])
def purchase_return_list_create(request):
    if request.method == "GET":
        qs = PurchaseReturn.objects.select_related("invoice")[:200]
        return JsonResponse({"results": [
            {
                "id": r.pk,
                "invoice": r.invoice_id,
                "item_name": r.item_name,
                "quantity": str(r.quantity),
                "unit": r.unit,
                "amount": str(r.amount),
                "reason": r.reason,
                "date": str(r.date),
            }
            for r in qs
        ]})

    import json
    d = json.loads(request.body)
    r = PurchaseReturn.objects.create(
        invoice_id=d.get("invoice"),
        item_name=d.get("item_name", ""),
        quantity=d.get("quantity", 0),
        unit=d.get("unit", "unit"),
        amount=d.get("amount", 0),
        reason=d.get("reason", ""),
        date=d.get("date", timezone.localdate()),
    )
    return JsonResponse({"id": r.pk}, status=201)


@require_http_methods(["DELETE"])
def purchase_return_delete(request, pk):
    PurchaseReturn.objects.filter(pk=pk).delete()
    return JsonResponse({}, status=204)


# ═══════════════════════════════════════
#  Expense — هزینه‌ها
# ═══════════════════════════════════════


@require_http_methods(["GET", "POST"])
def expense_list_create(request):
    if request.method == "GET":
        qs = Expense.objects.all()
        if request.GET.get("from"):
            qs = qs.filter(date__gte=request.GET["from"])
        if request.GET.get("to"):
            qs = qs.filter(date__lte=request.GET["to"])
        return JsonResponse({"results": [
            {
                "id": e.pk,
                "title": e.title,
                "amount": str(e.amount),
                "category": e.category,
                "date": str(e.date),
                "note": e.note,
            }
            for e in qs[:200]
        ]})

    import json
    d = json.loads(request.body)
    e = Expense.objects.create(
        title=d.get("title", ""),
        amount=d.get("amount", 0),
        category=d.get("category", "سایر"),
        date=d.get("date", timezone.localdate()),
        note=d.get("note", ""),
    )
    return JsonResponse({"id": e.pk}, status=201)


@require_http_methods(["DELETE"])
def expense_delete(request, pk):
    Expense.objects.filter(pk=pk).delete()
    return JsonResponse({}, status=204)


# ═══════════════════════════════════════
#  Profit & Loss Report — گزارش سود و زیان
# ═══════════════════════════════════════


def profit_report(request):
    date_from = request.GET.get("from", str(timezone.localdate().replace(day=1)))
    date_to = request.GET.get("to", str(timezone.localdate()))

    sales = SalesInvoice.objects.filter(date__range=[date_from, date_to])
    purchases = PurchaseInvoice.objects.filter(date__range=[date_from, date_to])
    sales_returns = SalesReturn.objects.filter(date__range=[date_from, date_to])
    purchase_returns = PurchaseReturn.objects.filter(date__range=[date_from, date_to])
    expenses = Expense.objects.filter(date__range=[date_from, date_to])

    total_sales = sum(i.total for i in sales)
    total_sales_discount = sum(i.discount for i in sales)
    total_purchases = sum(i.total_amount for i in purchases)
    total_sales_returns = sum(r.amount for r in sales_returns)
    total_purchase_returns = sum(r.amount for r in purchase_returns)
    total_expenses = sum(e.amount for e in expenses)

    gross = (total_sales - total_sales_returns) - (total_purchases - total_purchase_returns)
    net = gross - total_expenses

    return JsonResponse({
        "from": date_from,
        "to": date_to,
        "total_sales": str(total_sales),
        "total_sales_discount": str(total_sales_discount),
        "total_sales_returns": str(total_sales_returns),
        "total_purchases": str(total_purchases),
        "total_purchase_returns": str(total_purchase_returns),
        "gross_profit": str(gross),
        "total_expenses": str(total_expenses),
        "net_profit": str(net),
    })