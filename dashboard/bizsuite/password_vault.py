"""
Recoverable copy of a customer's password, kept ONLY for passwords the super admin sets through the admin panel.

* The copy is Fernet-encrypted. The key comes from env ``PASSWORD_VAULT_KEY`` (a Fernet key) when set, otherwise it is
  derived from ``settings.SECRET_KEY`` with HKDF-SHA256. Anyone who has the database AND the key can read the copies.
* Sign-in never uses it: authentication stays on Django's normal password hash.
* It can never be stale: ``User.set_password`` deletes the copy (customer change, reset, anything), and ``reveal``
  additionally checks the decrypted text against the live hash and drops the copy when they differ.
"""
from __future__ import annotations

import base64
import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.contrib.auth.hashers import check_password

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    raw = os.getenv("PASSWORD_VAULT_KEY", "").strip()
    if raw:
        return Fernet(raw.encode())
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"bizsuite-password-vault-v1").derive(
        settings.SECRET_KEY.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def store(user, raw_password: str) -> None:
    """Keep an encrypted copy of ``raw_password`` (call it right after ``set_password`` + save)."""
    from .models import PasswordCopy
    token = _fernet().encrypt(raw_password.encode()).decode()
    PasswordCopy.objects.update_or_create(user=user, defaults={"token": token})


def discard(user_id) -> None:
    from .models import PasswordCopy
    if user_id:
        PasswordCopy.objects.filter(user_id=user_id).delete()


def reveal(user):
    """The customer's current password, or None when there is no (valid) copy."""
    from .models import PasswordCopy
    row = PasswordCopy.objects.filter(user=user).first()
    if row is None:
        return None
    try:
        raw = _fernet().decrypt(row.token.encode()).decode()
    except (InvalidToken, ValueError):
        row.delete()
        return None
    if not check_password(raw, user.password):
        row.delete()
        return None
    return raw
