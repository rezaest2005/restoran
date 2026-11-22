"""Pluggable bridge adapters.

An adapter speaks to ONE kind of device/bridge on behalf of the server (``server`` mode). The only adapter that
exists is ``http_bridge`` - the generic JSON protocol documented in protocol.py / docs/CARD_READER.md.

Real Iranian PSP terminals (Saman, Sadad, Pasargad ...) use vendor PC-POS protocols; none is implemented here and
none was verified against real hardware. To support one, subclass BridgeAdapter (or write a small local bridge that
speaks the HTTP protocol) and register it with ``register``.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import requests

from . import net
from .protocol import (
    UNKNOWN, UNREACHABLE, REJECTED, BridgeResult, normalize_response,
)

logger = logging.getLogger(__name__)

MAX_BODY = 16 * 1024
CONNECT_TIMEOUT = 4
PROBE_TIMEOUT = 4
CANCEL_TIMEOUT = 8
PING_REFERENCE = "__ping__"


@dataclass
class Target:
    host: str
    port: int
    timeout: int = 90      # seconds the customer may take (read timeout of the payment call)


class BridgeAdapter:
    code = ""
    label = ""

    def probe(self, target: Target, reference: str) -> tuple[bool, int | None]:
        """(reachable, http_status). Must never raise."""
        raise NotImplementedError

    def pay(self, target: Target, *, amount: int, reference: str, description: str) -> BridgeResult:
        raise NotImplementedError

    def status(self, target: Target, reference: str) -> BridgeResult:
        raise NotImplementedError

    def cancel(self, target: Target, reference: str) -> bool:
        raise NotImplementedError


class _Unreachable(Exception):
    pass


class HttpBridgeAdapter(BridgeAdapter):
    code = "http_bridge"
    label = "HTTP bridge (JSON)"

    # -- transport ---------------------------------------------------------
    def _call(self, method, target: Target, path, *, json_body=None, params=None, read_timeout):
        """-> (status_code, parsed_json_or_None). Raises _Unreachable when no connection could be made at all,
        requests exceptions for anything after that."""
        try:
            ip = net.resolve_safe(target.host, target.port)
        except (net.UnsafeAddress, net.ResolveError) as exc:
            raise _Unreachable(type(exc).__name__) from exc
        url = f"http://{net.ip_url_host(ip)}:{int(target.port)}{path}"
        sess = requests.Session()
        sess.trust_env = False                      # ignore HTTP(S)_PROXY from the environment
        resp = sess.request(
            method, url, json=json_body, params=params,
            headers={"Host": f"{target.host}:{int(target.port)}", "Accept": "application/json"},
            timeout=(CONNECT_TIMEOUT, read_timeout), allow_redirects=False, stream=True,
        )
        try:
            raw = resp.raw.read(MAX_BODY + 1, decode_content=True)
        finally:
            resp.close()
            sess.close()
        if len(raw) > MAX_BODY:
            return resp.status_code, None
        try:
            body = json.loads(raw.decode("utf-8")) if raw else None
        except (ValueError, UnicodeDecodeError):
            body = None
        return resp.status_code, body

    # -- API ---------------------------------------------------------------
    def probe(self, target, reference):
        try:
            code, _ = self._call("GET", target, "/api/payment/status", params={"rrn": reference},
                                 read_timeout=PROBE_TIMEOUT)
            return True, code
        except Exception:
            return False, None

    def pay(self, target, *, amount, reference, description):
        try:
            code, body = self._call(
                "POST", target, "/api/payment",
                json_body={"amount": int(amount), "rrn": reference, "description": description[:80]},
                read_timeout=target.timeout,
            )
        except _Unreachable:
            return BridgeResult(UNREACHABLE)
        except Exception as exc:
            # the request may have reached the device: never claim "not charged"
            logger.warning("card bridge payment call ended without an answer: %s", type(exc).__name__)
            return BridgeResult(UNKNOWN, message=type(exc).__name__)
        return _from_http(code, body)

    def status(self, target, reference):
        try:
            code, body = self._call("GET", target, "/api/payment/status", params={"rrn": reference},
                                    read_timeout=PROBE_TIMEOUT * 2)
        except _Unreachable:
            return BridgeResult(UNREACHABLE)
        except Exception as exc:
            return BridgeResult(UNKNOWN, message=type(exc).__name__)
        return _from_http(code, body, query=True)

    def cancel(self, target, reference):
        try:
            code, body = self._call("POST", target, "/api/payment/cancel", json_body={"rrn": reference},
                                    read_timeout=CANCEL_TIMEOUT)
        except Exception:
            return False
        return 200 <= code < 300 and not (isinstance(body, dict) and body.get("success") is False)


def _from_http(code, body, query=False) -> BridgeResult:
    if code in (301, 302, 303, 307, 308):
        return BridgeResult(REJECTED, message="redirect refused")
    if 400 <= code < 500:
        res = normalize_response(body, query=query) if isinstance(body, dict) else BridgeResult(REJECTED)
        if query and code == 404:
            return BridgeResult("not_found", message=res.message)
        # a 4xx never carries an approval
        if res.outcome == "approved":
            return BridgeResult(UNKNOWN, message="inconsistent response")
        return BridgeResult(REJECTED if res.outcome in ("unknown", "pending", "not_found") else res.outcome,
                            message=res.message, rrn=res.rrn)
    if code >= 500 or body is None:
        return BridgeResult(UNKNOWN, message=f"http {code}")
    return normalize_response(body, query=query)


_REGISTRY: dict[str, BridgeAdapter] = {}


def register(adapter: BridgeAdapter):
    _REGISTRY[adapter.code] = adapter
    return adapter


def get_adapter(code: str) -> BridgeAdapter:
    try:
        return _REGISTRY[code]
    except KeyError:
        raise KeyError(f"unknown card terminal adapter {code!r}") from None


def adapter_choices():
    return [(a.code, a.label) for a in _REGISTRY.values()]


register(HttpBridgeAdapter())
