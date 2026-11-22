"""The super admin can see a customer's current password only while it is the one set from the admin panel."""
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from bizsuite import password_vault
from bizsuite.models import ActivityLog, PasswordCopy, User
from bizsuite.tenancy import clear_current_business
from bizsuite.views.super_admin.auth import _make_super_token

P = "Pass12345!"
SECRET = "Zx9-plain-secret"


class VaultTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = User.objects.create_superuser(username="v_root", password=P)

    def setUp(self):
        clear_current_business()

    def sup(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Token " + _make_super_token(self.root))
        return c

    def make(self, password=SECRET, username="vcust"):
        r = self.sup().post("/api/super/users/create/", {"username": username, "password": password}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["user_id"]

    def reveal(self, uid, client=None):
        return (client or self.sup()).get(f"/api/super/users/{uid}/password/")

    def test_reveal_after_create(self):
        uid = self.make()
        r = self.reveal(uid)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"password": SECRET})
        self.assertEqual(r["Cache-Control"], "no-store")
        # sign-in still uses the normal hash
        self.assertTrue(User.objects.get(pk=uid).check_password(SECRET))

    def test_reveal_after_admin_change(self):
        uid = self.make()
        r = self.sup().put(f"/api/super/users/{uid}/", {"password": "newer-pass-1"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.reveal(uid).json(), {"password": "newer-pass-1"})
        # saving the form without a password keeps the copy
        self.sup().put(f"/api/super/users/{uid}/", {"first_name": "x"}, format="json")
        self.assertEqual(self.reveal(uid).json(), {"password": "newer-pass-1"})

    def test_null_after_customer_changes_it(self):
        uid = self.make()
        c = APIClient()
        c.force_authenticate(User.objects.get(pk=uid))
        r = c.post("/api/auth/change-password/", {"old_password": SECRET, "new_password": "Cust-own-pass-77!",
                                                  "new_password_confirm": "Cust-own-pass-77!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(PasswordCopy.objects.filter(user_id=uid).count(), 0)
        self.assertEqual(self.reveal(uid).json(), {"password": None})

    def test_null_after_any_set_password_and_stale_copy_is_never_shown(self):
        uid = self.make()
        u = User.objects.get(pk=uid)
        u.set_password("another-one-9")
        u.save()
        self.assertEqual(self.reveal(uid).json(), {"password": None})
        # even a copy that survived a raw hash change is refused (checked against the live hash)
        uid2 = self.make(username="vcust2")
        User.objects.filter(pk=uid2).update(password=User.objects.get(pk=uid).password)
        self.assertEqual(self.reveal(uid2).json(), {"password": None})
        self.assertFalse(PasswordCopy.objects.filter(user_id=uid2).exists())

    def test_old_account_without_copy(self):
        u = User.objects.create_user(username="old", password=P, role="owner", is_approved=True)
        self.assertEqual(self.reveal(u.pk).json(), {"password": None})

    def test_only_super_admin(self):
        uid = self.make()
        self.assertIn(APIClient().get(f"/api/super/users/{uid}/password/").status_code, (401, 403))
        owner = APIClient()
        owner.force_authenticate(User.objects.get(pk=uid))
        self.assertIn(self.reveal(uid, owner).status_code, (401, 403))
        self.assertEqual(self.sup().get("/api/super/users/999999/password/").status_code, 404)

    def test_never_in_list_or_detail(self):
        uid = self.make()
        for url in ("/api/super/users/", f"/api/super/users/{uid}/"):
            body = self.sup().get(url).content.decode()
            self.assertNotIn(SECRET, body)
            self.assertNotIn("password", body.lower())

    def test_encrypted_at_rest(self):
        uid = self.make()
        token = PasswordCopy.objects.get(user_id=uid).token
        self.assertNotIn(SECRET, token)
        with connection.cursor() as cur:
            cur.execute("SELECT token FROM bizsuite_passwordcopy WHERE user_id = %s", [uid])
            raw = cur.fetchone()[0]
        self.assertNotIn(SECRET, raw)
        self.assertEqual(password_vault._fernet().decrypt(raw.encode()).decode(), SECRET)

    def test_each_reveal_is_logged_without_the_password(self):
        uid = self.make()
        self.reveal(uid)
        self.reveal(uid)
        rows = ActivityLog.all_objects.filter(action="password.revealed")
        self.assertEqual(rows.count(), 2)
        self.assertEqual(rows[0].summary, "password revealed")
        self.assertNotIn(SECRET, str(list(rows.values())))

    def test_rate_limited(self):
        from django.core.cache import cache
        cache.clear()
        uid = self.make()
        codes = [self.reveal(uid).status_code for _ in range(25)]
        self.assertEqual(codes[:20], [200] * 20)
        self.assertEqual(codes[-1], 429)
        cache.clear()

    def test_custom_key_from_environment(self):
        import os
        from unittest import mock
        from cryptography.fernet import Fernet
        uid = self.make()
        with mock.patch.dict(os.environ, {"PASSWORD_VAULT_KEY": Fernet.generate_key().decode()}):
            # a different key cannot read the old copy: it is dropped, not shown
            self.assertEqual(self.reveal(uid).json(), {"password": None})
