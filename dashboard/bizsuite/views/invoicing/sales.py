"""
فاکتور و مشتریان — فاکتور فروش و برگشت از فروش
"""
from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from ..common import staff_endpoint

from ...models import SalesInvoice, SalesInvoiceItem, SalesReturn
from ...accounting_posting import (
    post_sales_invoice, post_sales_return, repost, safe_post, unpost,
)


# ═══════════════════════════════════════
#  SalesInvoice — فاکتور فروش
# ═══════════════════════════════════════


@staff_endpoint(["GET", "POST"], "accounting", "inventory")
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
        safe_post(post_sales_invoice, inv, request.user if request.user.is_authenticated else None)
    return JsonResponse(_invoice_dict(inv, detail=True), status=201)


@staff_endpoint(["GET", "PUT", "DELETE"], "accounting", "inventory")
def sales_invoice_detail(request, pk):
    try:
        inv = SalesInvoice.objects.prefetch_related("items", "returns").get(pk=pk)
    except SalesInvoice.DoesNotExist:
        return JsonResponse({"detail": "یافت نشد"}, status=404)

    if request.method == "DELETE":
        unpost(inv.business, "sales_invoice", inv.pk, user=request.user, reason="حذف فاکتور")
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
        repost(inv, "sales_invoice", post_sales_invoice,
               request.user if request.user.is_authenticated else None)

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


@staff_endpoint(["GET", "POST"], "accounting", "inventory")
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
    safe_post(post_sales_return, r, request.user if request.user.is_authenticated else None)
    return JsonResponse({"id": r.pk}, status=201)


@staff_endpoint(["DELETE"], "accounting", "inventory")
def sales_return_delete(request, pk):
    for r in SalesReturn.objects.filter(pk=pk):
        unpost(r.business, "sales_return", r.pk, user=request.user, reason="حذف مرجوعی")
    SalesReturn.objects.filter(pk=pk).delete()
    return JsonResponse({}, status=204)
