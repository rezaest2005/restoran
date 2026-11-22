"""SSRF guard for the server-side card terminal calls.

Only private destinations are reachable: RFC1918, loopback (switchable), link-local.
The name is resolved here, every resolved address is checked, and the connection is then made to that
literal address (so a DNS answer cannot change between "check" and "use"). Redirects are never followed.
"""
from __future__ import annotations

import ipaddress
import socket

from django.conf import settings


class UnsafeAddress(Exception):
    """The configured host is not an allowed private address."""


class ResolveError(Exception):
    """The host name does not resolve."""


_PRIVATE_NETS = [ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",      # RFC1918
    "169.254.0.0/16", "fe80::/10",                         # link-local
    "fc00::/7",                                            # IPv6 unique local
)]
_LOOPBACK_NETS = [ipaddress.ip_network(n) for n in ("127.0.0.0/8", "::1/128")]
# Cloud metadata endpoints live in link-local space; never allowed.
_DENY = [ipaddress.ip_address(a) for a in ("169.254.169.254", "fd00:ec2::254", "169.254.170.2")]


def allow_loopback() -> bool:
    return bool(getattr(settings, "CARD_READER_ALLOW_LOOPBACK", True))


def is_allowed_ip(ip) -> bool:
    if isinstance(ip, str):
        ip = ipaddress.ip_address(ip)
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped
    if ip in _DENY or ip.is_unspecified or ip.is_multicast:
        return False
    if any(ip in n for n in _LOOPBACK_NETS):
        return allow_loopback()
    return any(ip in n for n in _PRIVATE_NETS)


def resolve_safe(host: str, port: int) -> str:
    """Return one allowed literal IP for host. Raises UnsafeAddress / ResolveError."""
    host = (host or "").strip().strip("[]")
    if not host:
        raise ResolveError("empty host")
    try:
        addrs = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, int(port), type=socket.SOCK_STREAM)
        except (socket.gaierror, UnicodeError, OSError) as exc:
            raise ResolveError(str(exc)) from exc
        addrs = []
        for info in infos:
            try:
                addrs.append(ipaddress.ip_address(info[4][0]))
            except ValueError:
                continue
        if not addrs:
            raise ResolveError("no address")
    # every answer must be allowed (a mixed public/private answer is refused outright)
    for a in addrs:
        if not is_allowed_ip(a):
            raise UnsafeAddress(str(a))
    return str(addrs[0])


def ip_url_host(ip: str) -> str:
    return f"[{ip}]" if ":" in ip else ip
