"""
فاکتور و مشتریان — برگشت از خرید، هزینه‌ها و گزارش سود
"""

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ...models import (
    Expense,
    PurchaseInvoice,
    PurchaseReturn,
    SalesInvoice,
    SalesReturn,
)


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
