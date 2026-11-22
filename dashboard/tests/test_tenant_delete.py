"""Deleting a business from the super-admin panel removes it together with its own accounts."""
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, Tenant, User
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token

P = "Pass12345!"


class TenantDeleteTests(TestCase):
    def setUp(self):
        clear_current_business()
        self.root = User.objects.create_user(username="td_root", password=P, is_superuser=True, is_staff=True)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))

    def make(self, slug, owner):
        r = self.api.post("/api/super/users/create/", {"username": owner, "password": "Sup3r-Secret-9"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        b = Business.objects.get(pk=r.json()["business_id"])
        Business.objects.filter(pk=b.pk).update(slug=slug)
        return b.tenant, User.objects.get(username=owner)

    def test_delete_removes_business_owner_and_staff_but_not_others(self):
        keep, _ = self.make("td-keep", "td_keep_owner")
        gone, gone_owner = self.make("td-gone", "td_gone_owner")
        b = Business.objects.get(slug="td-gone")
        User.objects.create_user(username="td_gone_staff", password=P, role="cashier", business=b, is_approved=True)
        r = self.api.delete(f"/api/super/users/{gone_owner.pk}/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(Business.objects.filter(slug="td-gone").exists())
        self.assertFalse(Tenant.objects.filter(pk=gone.pk).exists())
        self.assertFalse(User.objects.filter(username__in=["td_gone_owner", "td_gone_staff"]).exists())
        self.assertTrue(Business.objects.filter(slug="td-keep").exists())
        self.assertTrue(User.objects.filter(username="td_keep_owner").exists())
        self.assertTrue(User.objects.filter(username="td_root", is_superuser=True).exists())

    def test_delete_never_removes_a_super_admin_attached_to_the_business(self):
        t, sup_owner = self.make("td-sup", "td_sup_owner")
        b = Business.objects.get(slug="td-sup")
        User.objects.filter(pk=self.root.pk).update(business=b)
        r = self.api.delete(f"/api/super/users/{sup_owner.pk}/")
        self.assertEqual(r.status_code, 200, r.content)
        root = User.objects.get(pk=self.root.pk)
        self.assertTrue(root.is_superuser)
        self.assertIsNone(root.business_id)
