"""One transport role: courier (orders) and cargo/unit driver are the same person type.

Users & access and the fleet form share one service; old role names (driver / courier) still work."""
import importlib

from django.apps import apps as django_apps
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite.features import user_features
from bizsuite.models import Business, Driver, User, Vehicle
from bizsuite.modules import ensure_catalog
from bizsuite.roles import ROLE_CHOICES, normalize_role
from bizsuite.tenancy import clear_current_business

P = "Pass12345!"


class TransportPeopleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_catalog()
        cls.b = Business.objects.create(name="کارخانه", slug="tp-factory")
        cls.o = Business.objects.create(name="دیگر", slug="tp-other")
        cls.owner = User.objects.create_user(username="tp_owner", password=P, role="owner", business=cls.b, is_approved=True)
        cls.other_owner = User.objects.create_user(username="tpo_owner", password=P, role="owner", business=cls.o, is_approved=True)

    def setUp(self):
        clear_current_business()

    def api(self, user):
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=user.pk))
        return c

    # ── role ──────────────────────────────────────────
    def test_single_transport_role_and_legacy_aliases(self):
        codes = [c[0] for c in ROLE_CHOICES]
        self.assertIn("transport", codes)
        self.assertNotIn("driver", codes)
        self.assertEqual(normalize_role("driver"), "transport")
        self.assertEqual(normalize_role("courier"), "transport")
        self.assertEqual(normalize_role("cashier"), "cashier")

    def test_legacy_role_names_accepted_by_user_api_and_make_a_driver_record(self):
        c = self.api(self.owner)
        for i, legacy in enumerate(("driver", "courier", "transport")):
            r = c.post("/api/users/create/", {"username": f"leg{i}", "password": "secret99", "role": legacy,
                                              "first_name": "علی", "phone_number": f"0912000000{i}"}, format="json")
            self.assertEqual(r.status_code, 200, r.content)
            u = User.objects.get(pk=r.json()["user_id"])
            self.assertEqual(u.role, "transport")
            d = Driver.all_objects.get(user=u)
            self.assertEqual((d.business_id, d.number, d.name, d.phone), (self.b.id, i + 1, "علی", f"0912000000{i}"))
            self.assertFalse(user_features(u) - {"home"})     # no dashboard tabs

    def test_role_change_to_transport_creates_driver_record(self):
        u = User.objects.create_user(username="tp_cash", password=P, role="cashier", business=self.b)
        r = self.api(self.owner).post("/api/users/update-role/", {"user_id": u.id, "role": "driver"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(User.objects.get(pk=u.pk).role, "transport")
        self.assertTrue(Driver.all_objects.filter(user=u).exists())

    # ── one form: Users & access → Transport ──────────
    def test_create_transport_person_with_new_vehicle(self):
        c = self.api(self.owner)
        r = c.post("/api/users/transport/", {
            "username": "karim", "password": "secret99", "first_name": "کریم", "last_name": "رضایی",
            "phone_number": "09121112233", "service": "cargo", "pay_per_trip": 50000,
            "new_vehicle": {"kind": "truck", "plate": "12ع345"},
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        u = User.objects.get(pk=body["user_id"])
        self.assertEqual((u.role, u.first_name, u.last_name, u.phone_number), ("transport", "کریم", "رضایی", "09121112233"))
        self.assertTrue(u.check_password("secret99"))
        d = Driver.all_objects.get(user=u)
        self.assertEqual((d.name, d.service, d.phone, d.number), ("کریم رضایی", "cargo", "09121112233", 1))
        self.assertEqual(d.default_vehicle.kind, "truck")
        self.assertEqual(d.default_vehicle.plate, "12ع345")
        self.assertEqual(body["driver"]["link_path"], "/tp-factory/bizsuite_driver/1")

        # it shows up in Users & access with its driver record
        users = c.get("/api/users/management/").json()["users"]
        row = next(x for x in users if x["id"] == u.id)
        self.assertEqual(row["role"], "transport")
        self.assertEqual(row["driver"]["service"], "cargo")
        self.assertEqual(row["driver"]["vehicle"]["plate"], "12ع345")

        # … and in the fleet list (same record)
        drivers = c.get("/api/delivery/drivers/").json()["data"]
        self.assertEqual([x["user_id"] for x in drivers], [u.id])

    def test_edit_transport_person(self):
        c = self.api(self.owner)
        v = Vehicle.all_objects.create(business=self.b, name="وانت ۱", kind="van")
        uid = c.post("/api/users/transport/", {"username": "ed1", "password": "secret99", "first_name": "الف"}, format="json").json()["user_id"]
        r = c.put(f"/api/users/transport/{uid}/", {"first_name": "ب", "service": "orders", "default_vehicle_id": v.id,
                                                    "password": "newpass1"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        d = Driver.all_objects.get(user_id=uid)
        self.assertEqual((d.name, d.service, d.default_vehicle_id), ("ب", "orders", v.id))
        u = User.objects.get(pk=uid)
        self.assertEqual(u.first_name, "ب")
        self.assertTrue(u.check_password("newpass1"))

    def test_transport_create_validation_and_isolation(self):
        c = self.api(self.owner)
        self.assertEqual(c.post("/api/users/transport/", {"username": "x", "first_name": "x"}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/users/transport/", {"username": "x", "password": "secret99", "first_name": "x",
                                                           "service": "rocket"}, format="json").status_code, 400)
        self.assertFalse(User.objects.filter(username__endswith="x", role="transport").exists())
        uid = c.post("/api/users/transport/", {"username": "iso", "password": "secret99", "first_name": "x"}, format="json").json()["user_id"]
        r = self.api(self.other_owner).put(f"/api/users/transport/{uid}/", {"password": "hacked99"}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertTrue(User.objects.get(pk=uid).check_password("secret99"))

    def test_options_list_vehicles(self):
        Vehicle.all_objects.create(business=self.b, name="موتور ۱")
        Vehicle.all_objects.create(business=self.o, name="غریبه")
        r = self.api(self.owner).get("/api/users/transport/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual([v["name"] for v in r.json()["vehicles"]], ["موتور ۱"])

    def test_cashier_without_users_tab_cannot_create(self):
        cash = User.objects.create_user(username="tp_c2", password=P, role="cashier", business=self.b)
        r = self.api(cash).post("/api/users/transport/", {"username": "z", "password": "secret99", "first_name": "z"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_deactivating_the_account_deactivates_the_driver(self):
        c = self.api(self.owner)
        uid = c.post("/api/users/transport/", {"username": "act", "password": "secret99", "first_name": "x"}, format="json").json()["user_id"]
        c.post("/api/users/toggle-active/", {"user_id": uid}, format="json")
        self.assertFalse(Driver.all_objects.get(user_id=uid).is_active)

    def test_fleet_form_uses_the_same_service(self):
        r = self.api(self.owner).post("/api/delivery/drivers/", {
            "name": "پیک ۱", "username": "fleet1", "password": "secret99", "service": "orders",
            "new_vehicle": {"kind": "motorbike", "plate": "۱۲۳"}}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()["data"]
        self.assertEqual((d["service"], d["vehicle"]["kind"]), ("orders", "motorbike"))
        self.assertEqual(User.objects.get(pk=d["user_id"]).role, "transport")

    def test_transport_user_signs_in_to_driver_app(self):
        c = self.api(self.owner)
        r = c.post("/api/users/transport/", {"username": "app1", "password": "secret99", "first_name": "x"}, format="json")
        username = r.json()["username"]
        login = APIClient().post("/api/auth/login/", {"username": username, "password": "secret99"}, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        self.assertEqual(login.json()["user"]["role"], "transport")
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION="Bearer " + login.json()["access"])
        self.assertEqual(api.get("/api/delivery/driver/me/").status_code, 200)
        self.assertEqual(api.get("/api/delivery/drivers/").status_code, 403)


class TransportMigrationTests(TestCase):
    """The data step of 0014_unify_transport_roles: driver/courier accounts → transport + driver record."""

    def test_legacy_accounts_are_converted(self):
        ensure_catalog()
        b = Business.objects.create(name="قدیمی", slug="tp-legacy")
        linked = User.objects.create_user(username="old_d1", password=P, business=b)
        loose = User.objects.create_user(username="old_d2", password=P, business=b, first_name="حسن", phone_number="09350000000")
        courier = User.objects.create_user(username="old_c", password=P, business=b)
        User.objects.filter(pk__in=[linked.pk, loose.pk]).update(role="driver")
        User.objects.filter(pk=courier.pk).update(role="courier")
        Driver.all_objects.create(business=b, number=4, name="قبلی", user=linked)

        mig = importlib.import_module("bizsuite.migrations.0014_unify_transport_roles")
        mig.to_transport(django_apps, None)

        self.assertEqual(set(User.objects.filter(business=b).values_list("role", flat=True)), {"transport"})
        self.assertEqual(Driver.all_objects.filter(user=linked).count(), 1)                 # kept, not duplicated
        d = Driver.all_objects.get(user=loose)
        self.assertEqual((d.name, d.phone, d.number), ("حسن", "09350000000", 5))
        self.assertEqual(Driver.all_objects.get(user=courier).number, 6)

        mig.to_driver(django_apps, None)
        self.assertEqual(User.objects.get(pk=loose.pk).role, "driver")
