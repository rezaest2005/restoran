"""
Local-first sync layer (phase 1).

A per-business change log + pull/push/status API so a client can keep a copy of the catalog, customers and orders
on its own device and work from it (even offline). The server stays the source of truth: every pushed mutation is
applied through the existing view/service logic. See docs/LOCAL_FIRST.md.

Nothing here changes the behaviour of the existing models; the change log is written by signals after commit.
"""
