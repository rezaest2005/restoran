"""
فاکتور و مشتریان — مشتریان
"""

from django.http import JsonResponse
from ..common import staff_endpoint

from ...models import Customer


# ═══════════════════════════════════════
#  Customer — مشتریان
# ═══════════════════════════════════════


@staff_endpoint(["GET", "POST"], "pos", "club", "accounting", "inventory", "dictionary")
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


@staff_endpoint(["GET", "PUT", "DELETE"], "pos", "club", "accounting", "inventory", "dictionary")
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
