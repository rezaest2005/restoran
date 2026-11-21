# TODO next

Status (2026-11-21): seven feature branches merged into `web`: responsive panels, one Transport person type +
guided Definitions hub, multi-level formulation with production line and planner, standalone accounting,
generic delivery, standalone customer club, industry presets + setup wizard + module-aware home.
Backend suite: 534 passing. Browser-tested for a restaurant and a detergent factory.

Migrations added: 0014_production_routing, 0015_delivery_zones_pod_timeline, 0016_unify_transport_roles,
0017_club_loyalty_suite, 0018_business_industry, 0019_accounting_pro_ledger. Back up production before deploying.

## Known gaps, in rough priority
1. Formulation: the "complete order" dialog has no per-material actual-consumption editor (API supports it).
2. Formulation: planner and orders use total stock / main warehouse; no warehouse choice. Box/pack units have no conversion.
3. Formulation: per-unit analysis spreads the whole stage setup time over a batch of 1 when output quantity is 1,
   so labour per unit looks high. Show it per typical batch size instead.
4. Club: real SMS provider (`settings.CLUB_SMS_PROVIDER`), redeem points/coupons on the POS screen, reverse points when a POS order is cancelled.
5. Delivery: road routing (now straight line x 1.3), split stops across drivers, draw zones on a map.
6. Accounting: Excel import, voucher numbers per fiscal year, fixed assets, multi-currency, payroll, Iran e-invoice (سامانه مودیان).
7. Dashboard: industry selector in the super-admin tenant form; use `useTerm()` on POS, Definitions and inventory pages.
8. Dispatch driver picker does not filter by the transport person's service (orders / cargo).
9. A React "unknown prop on a DOM element" dev warning appeared once during the setup wizard; not reproduced since.
10. `npm run lint` still reports 77 older errors (none added by these branches).
