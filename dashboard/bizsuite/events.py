"""
In-process domain events: the seam between business modules.

A module that does something other modules care about (an order was paid, an invoice was saved ...) calls
``publish("pos_order.paid", order=order, user=user)`` instead of importing the other modules. Each interested
module subscribes its own handler once, at ``AppConfig.ready()`` (see ``apps.py``).

Contract
--------
* Synchronous and in the publisher's thread/transaction: a handler runs exactly where the old direct call ran,
  so ``transaction.atomic`` semantics are unchanged (a handler that writes joins the caller's transaction).
* Handlers run in subscription order.
* A handler exception is logged and swallowed (``logger.exception``) unless ``strict=True`` — the same isolation
  the old ``try/except`` hooks had. Handlers that already isolate themselves (accounting ``safe_post``) just work.
* ``publish`` returns the list of values the handlers returned (exceptions skipped), so a publisher can use the
  answer of a handler (e.g. the courier-dispatch result) without importing it.
* Event names are declared in ``module_registry.EVENTS`` (publisher, subscribers, payload); a test fails when
  code publishes/subscribes an undeclared event.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_handlers: dict[str, list] = {}


def subscribe(event: str, handler) -> None:
    """Register ``handler(**payload)`` for ``event``. Registering the same handler twice is a no-op."""
    lst = _handlers.setdefault(event, [])
    if handler not in lst:
        lst.append(handler)


def publish(event: str, *, strict: bool = False, **payload) -> list:
    """Call every handler of ``event`` synchronously and return their results (see module docstring)."""
    results = []
    for handler in list(_handlers.get(event, ())):
        try:
            results.append(handler(**payload))
        except Exception:
            if strict:
                raise
            logger.exception("event handler failed: %s -> %s", event, getattr(handler, "__qualname__", handler))
    return results


def first(results):
    """First non-None handler result (convenience for request-style events)."""
    return next((r for r in results if r is not None), None)


def subscribers(event: str) -> list:
    return list(_handlers.get(event, ()))


def clear() -> None:
    """Forget every subscription (test helper)."""
    _handlers.clear()
