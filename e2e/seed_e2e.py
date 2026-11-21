from bizsuite.models import Business, User
from bizsuite.modules import apply_modules, ensure_catalog
ensure_catalog()
ALL = ["pos", "club", "inventory", "production", "accounting", "delivery", "feedback", "storefront"]
def mk(slug, name, user, mods):
    b, _ = Business.objects.get_or_create(slug=slug, defaults={"name": name})
    apply_modules(b, {c: {"is_enabled": c in mods} for c in ALL}, auto_requires=False)
    u = User.objects.filter(username=user).first() or User.objects.create_user(username=user, password="E2ePass123!", role="owner", business=b)
    u.is_approved = True; u.save()
    print(slug, b.id, [c for c in ALL if c in mods])
mk("resto-e2e", "کافه رستوران نمونه", "resto_owner", ["accounting", "delivery", "club"])
mk("soap-e2e", "کارخانه مایع شوینده پاکان", "soap_owner", ["production", "inventory", "accounting"])
