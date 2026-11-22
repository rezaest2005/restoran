"""
Card terminal (کارتخوان) integration.

* ``net``       - SSRF guard for server-side calls (private addresses only, no redirects)
* ``protocol``  - the JSON bridge protocol: amounts, request/response normalisation, card masking, HMAC token
* ``adapters``  - pluggable adapter registry (only the generic HTTP bridge is implemented)
* ``services``  - attempts (idempotent, one open attempt per order), results, finalising the order

Docs: docs/CARD_READER.md
"""
