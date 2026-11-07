# TODO next: support tickets and feedback

Status: everything planned for this feature is implemented and committed (fff0145, 5368485).
Nothing is half-written and nothing was unwired. Backend suite: 305 passing.
No browser was available, so the UI has never been seen running.

## Backend (all done, covered by dashboard/tests/test_support.py)
- GET/POST /api/support/tickets/  - done
- GET /api/support/tickets/<id>/  - done
- POST /api/support/tickets/<id>/messages/  - done
- POST /api/support/tickets/<id>/resolve/  - done
- GET /api/super/support/tickets/  - done
- GET /api/super/support/tickets/<id>/  - done
- POST /api/super/support/tickets/<id>/reply/  - done
- POST /api/super/support/tickets/<id>/status/  - done
- GET /api/super/support/summary/  - done
- Migration: bizsuite/migrations/0005_support_tickets.py

## Frontend (all done, unverified visually)
- Business hub tab: web/src/features/business/support/ (SupportPage, NewTicketDialog, ThreadDialog, api.js, common.js, useLoad.js)
- Feedback hub tab: web/src/features/business/feedback/
- Public form /f/:slug: web/src/features/public/feedback/FeedbackPublicPage.jsx
- Super admin tab: web/src/features/super_admin/support/ (SupportPanel, api.js); wired in layout/SuperAdminLayout.jsx and layout/SuperSidebar.jsx, nav in common/superConfig.js
- Locale parts: ui_fb, ui_sup (fa/en)

## Next steps, in order
1. Manual browser pass at 360px and desktop, RTL and LTR, light and dark: public form, feedback tab, support tab, super admin Support tab.
2. Check keyboard keys: F2, Ctrl+A/Ctrl+Z, Enter, Ctrl+D, Escape, F1, Alt+5 in the super admin.
3. Check the 60 s badge polling in SuperAdminLayout and the sidebar badge.
4. Confirm the storefront payload `slug` is the business slug (footer link to /f/<slug>).
5. Optional: show a copyable public feedback link in the business feedback tab (needs the business slug on the user object).
6. Optional: frontend tests; none exist for the new components.
