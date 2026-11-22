"""The bridge protocol (same in `server` and `local_bridge` mode).

POST /api/payment         {amount, rrn, description} -> {success, status, trace_number, ref_number, card_number, message}
POST /api/payment/cancel  {rrn}                       -> {success, message}
GET  /api/payment/status?rrn=                         -> same shape as the payment response

`amount` is whatever unit the business configured (Toman or Rial); see to_device_amount().
"""
from __future__ import annotations

import hashlib
import hmac
import re
from dataclasses import dataclass

from django.conf import settings

UNIT_TOMAN = "toman"
UNIT_RIAL = "rial"
UNITS = (UNIT_TOMAN, UNIT_RIAL)

# outcomes
APPROVED = "approved"
DECLINED = "declined"
CANCELLED = "cancelled"
TIMEOUT = "timeout"          # the device itself timed out waiting for the card: nothing was charged
PENDING = "pending"          # status query: still waiting for the customer
NOT_FOUND = "not_found"      # status query: the bridge has no such transaction
UNREACHABLE = "unreachable"  # could not connect at all: the amount was never sent
REJECTED = "rejected"        # the bridge refused the request (HTTP 4xx): nothing was charged
UNKNOWN = "unknown"          # sent, but we do not know what happened (timeout, reset, garbage, 5xx)


def to_device_amount(toman: int, unit: str) -> int:
    """Toman (what the shop works in) -> the integer the device expects. Rial = Toman x 10."""
    toman = int(toman)
    if toman <= 0:
        raise ValueError("amount must be positive")
    if unit == UNIT_RIAL:
        return toman * 10
    if unit == UNIT_TOMAN:
        return toman
    raise ValueError(f"unknown unit {unit!r}")


@dataclass
class BridgeResult:
    outcome: str
    trace_number: str = ""
    ref_number: str = ""
    card_first6: str = ""
    card_last4: str = ""
    message: str = ""
    amount: int | None = None      # echoed amount, when the bridge sent one
    rrn: str = ""                  # echoed reference, when the bridge sent one


_DIGITS = re.compile(r"\D")
_LONG_DIGITS = re.compile(r"\d{9,}")
_TOKEN = re.compile(r"[^0-9A-Za-z_\-./]")


def mask_card(value) -> tuple[str, str]:
    """-> (first6, last4). Anything else of a card number is dropped. Accepts '621986******5678' / '****5678'."""
    s = str(value or "")
    digits = _DIGITS.sub("", s)
    if len(digits) >= 13 and "*" not in s and "x" not in s.lower():       # a (nearly) full number: keep the ends only
        return digits[:6], digits[-4:]
    head = re.match(r"^(\d{6})", s)
    tail = re.search(r"(\d{4})\s*$", s)
    return (head.group(1) if head else ""), (tail.group(1) if tail else "")


def clean_message(value, limit=120) -> str:
    """Short single-line text from the bridge; long digit runs (possible card numbers) are removed."""
    s = re.sub(r"[\x00-\x1f\x7f]", " ", str(value or ""))
    s = _LONG_DIGITS.sub("…", s)
    return re.sub(r"\s+", " ", s).strip()[:limit]


def clean_id(value, limit=32) -> str:
    return _TOKEN.sub("", str(value or ""))[:limit]


def _to_int(v):
    try:
        if v is None or isinstance(v, bool):
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None


def normalize_response(body, *, query=False) -> BridgeResult:
    """Turn a bridge JSON body into a BridgeResult with only whitelisted fields (HTTP 2xx assumed)."""
    if not isinstance(body, dict):
        return BridgeResult(UNKNOWN, message="bad response")
    status = str(body.get("status") or "").strip().lower()
    ok = body.get("success")
    if status in ("approved", "success", "succeeded", "paid") or (not status and ok is True):
        outcome = APPROVED
    elif status in ("cancelled", "canceled", "cancel", "user_cancelled"):
        outcome = CANCELLED
    elif status in ("timeout", "timed_out"):
        outcome = TIMEOUT
    elif status in ("pending", "processing", "waiting", "in_progress"):
        outcome = PENDING
    elif status in ("not_found", "notfound", "unknown_rrn"):
        outcome = NOT_FOUND
    elif status in ("declined", "failed", "rejected", "error", "denied") or ok is False:
        outcome = DECLINED
    else:
        outcome = UNKNOWN          # no recognisable status and no explicit success: never guess "paid"
    first6, last4 = mask_card(body.get("card_number") or body.get("card") or body.get("pan"))
    if not last4 and re.fullmatch(r"\d{4}", str(body.get("card_last4") or "")):
        last4 = str(body.get("card_last4"))
    return BridgeResult(
        outcome=outcome,
        trace_number=clean_id(body.get("trace_number")),
        ref_number=clean_id(body.get("ref_number")),
        card_first6=first6, card_last4=last4,
        message=clean_message(body.get("message")),
        amount=_to_int(body.get("amount")),
        rrn=clean_id(body.get("rrn"), 40),
    )


def make_reference(attempt_id: int, nonce: str) -> str:
    """The `rrn` sent to the device: unique per attempt, so a retry can never be mistaken for the same charge."""
    return f"{attempt_id}-{nonce[:8]}"


def attempt_token(business_id, attempt_id, order_id, device_amount, nonce) -> str:
    """HMAC the server hands to the cashier's browser and expects back with the bridge result.

    It binds the result to one open attempt (business, order, amount, nonce). It proves the report refers to
    an attempt this server opened; it cannot prove the browser really talked to a bridge (see docs).
    """
    msg = f"cardattempt|{business_id}|{attempt_id}|{order_id}|{device_amount}|{nonce}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def token_ok(expected: str, given) -> bool:
    return isinstance(given, str) and hmac.compare_digest(expected, given)
