"""A business has exactly one owner: the person who bought the account.

Creating a business creates one owner; no other path may add a second one by accident
(Users & access, role change, super-admin user form)."""
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.models import Business, User
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token

P = "Pass12345!"


class SingleOwnerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = User.objects.create_user(username="so_root", password=P, is_superuser=True, is_staff=True)
        cls.b = Business.objects.create(name="B", slug="so-b")
        cls.o = Business.objects.create(name="O", slug="so-o")
        cls.owner = User.objects.create_user(username="so_owner", password=P, role="owner", business=cls.b, is_approved=True)
        cls.staff = User.objects.create_user(username="so_staff", password=P, role="cashier", business=cls.b, is_approved=True)

    def setUp(self):
        clear_current_business()

    def sup(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        return c

    def biz(self):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=self.owner.pk))
        return c

    def owners(self, biz):
        return User.objects.filter(business=biz, role="owner").count()

    def test_creating_a_business_makes_exactly_one_owner(self):
        r = self.sup().post("/api/super/tenants/", {
            "name": "Resto", "slug": "so-resto", "owner_username": "so_new_owner", "owner_password": "Sup3r-Secret-9",
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        biz = Business.objects.get(slug="so-resto")
        self.assertEqual(User.objects.filter(business=biz).count(), 1)
        self.assertEqual(self.owners(biz), 1)

    def test_users_and_access_refuses_a_second_owner(self):
        r = self.biz().post("/api/users/create/", {"username": "so_x", "password": "secret99", "role": "owner"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(User.objects.filter(username__endswith="so_x").exists())
        self.assertEqual(self.owners(self.b), 1)

    def test_role_change_to_owner_refused(self):
        r = self.biz().post("/api/users/update-role/", {"user_id": self.staff.pk, "role": "owner"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(User.objects.get(pk=self.staff.pk).role, "cashier")

    def test_super_admin_user_form_refuses_a_second_owner(self):
        r = self.sup().post("/api/super/users/create/", {
            "username": "user1", "password": "secret99", "role": "owner", "business_id": self.b.pk}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(User.objects.filter(username="user1").exists())
        r = self.sup().put(f"/api/super/users/{self.staff.pk}/", {"role": "owner"}, format="json")
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(self.owners(self.b), 1)

    def test_super_admin_can_still_set_an_owner(self):
        # a business without an owner, or an explicit override
        r = self.sup().post("/api/super/users/create/", {
            "username": "so_first", "password": "secret99", "role": "owner", "business_id": self.o.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        r = self.sup().post("/api/super/users/create/", {
            "username": "so_extra", "password": "secret99", "role": "owner", "business_id": self.o.pk,
            "allow_additional_owner": True}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_editing_the_owner_itself_still_works(self):
        r = self.sup().put(f"/api/super/users/{self.owner.pk}/", {"first_name": "Ali", "role": "owner"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
