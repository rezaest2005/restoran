# ماژول‌ها و مرزهای آن‌ها (Modular monolith)

> English summary: the suite is a **modular monolith with hard boundaries**. Each business area is a module with
> owner files, a public interface, a declared dependency table, domain events for side effects, its own tests and
> a module card (`docs/modules/<name>.md`). One table (`dashboard/bizsuite/module_registry.py`) drives the AST guard
> (`tests/test_module_boundaries.py`), the per-module test runner (`scripts/test_module.py`) and these docs.
> Fix a bug inside one module, run `python scripts/test_module.py <module>` and you only re-test that module and the
> ones that can really be affected. Nothing here splits the Django app, changes a table or a URL.

## ۱. اصل کار (فارسی)

- **هسته (core)**: tenant، کاربران/نقش‌ها، مجوز و اشتراک (`features`/`modules`/`subscription`)، گزارش فعالیت،
  پنل مدیر کل، رویدادها (`events.py`) و ابزارهای مشترک. همهٔ ماژول‌ها می‌توانند از هسته استفاده کنند؛ هسته هرگز
  ماژول کسب‌وکاری را import نمی‌کند.
- **ماژول کسب‌وکاری**: pos، inventory، production، accounting، delivery، club، feedback، qr، card_terminal،
  support، catalog (و dashboard که فقط تجمیع خواندنی است). یک ماژول فقط در صورتی ماژول دیگر را صدا می‌زند که
  یال آن در `DEPENDS_ON` اعلام شده باشد و **فقط از طریق فایل‌های `public_api`** آن ماژول.
- **اثر جانبی بین ماژول‌ها = رویداد** (`events.publish` / `events.subscribe`)، نه import مستقیم. مثال: پرداخت سفارش
  ← `pos_order.paid` ← باشگاه امتیاز می‌دهد و حسابداری سند می‌زند. ماژول مقصد خاموش باشد، هندلر بی‌صدا هیچ کاری
  نمی‌کند (تست `test_module_independence`).
- **مدل‌های ماژول دیگر هرگز public نیستند**؛ خواندن مستقیم ORM از ماژول دیگر «تخلف» حساب می‌شود و در baseline
  ثبت است (فقط می‌تواند کم شود).

## ۲. ماژول‌ها و فایل‌های مالک

<!-- BEGIN GENERATED:modules -->
| module | tier | owner files | public interface | frontend | tests |
|---|---|---|---|---|---|
| core | core | `tenancy.py`<br>`middleware.py`<br>`utils.py`<br>`slugs.py`<br>`industries.py`<br>`pricing.py`<br>`context_processors.py`<br>`jobs.py`<br>`events.py`<br>`module_registry.py`<br>`module_boundaries.py`<br>`module_violations_baseline.py`<br>`models/business.py`<br>`models/common.py`<br>`models/jobs.py`<br>`models/menu.py`<br>`views/dashboard/constants.py`<br>`views/common.py`<br>`views/decorators.py`<br>`views/system.py`<br>`views/business_settings.py`<br>`views/helpers/files.py`<br>`templatetags/`<br>`templates/`<br>`static/` | - | `shared` | `test_tenant_delete`, `test_system_jobs`, `test_pages`, `test_neutrality`, `test_single_owner` |
| users | core | `roles.py`<br>`permissions.py`<br>`warehouse_access.py`<br>`auth_services.py`<br>`password_vault.py`<br>`models/user.py`<br>`views/auth/`<br>`views/users/` | - | `features/business/auth`<br>`features/business/config` | `test_access_save`, `test_browser_auth`, `test_courier_account`, `test_login_messages`, `test_password_vault`, `test_transport_people` |
| licensing | core | `features.py`<br>`modules.py`<br>`subscription.py`<br>`models/modules.py` | - | - | `test_features`, `test_modules`, `test_module_independence`, `test_subscription`, `test_console_fixes` |
| activity | core | `activity.py`<br>`models/activity.py`<br>`views/activity.py` | - | `features/business/activity` | `test_activity` |
| superadmin | core | `views/super_admin/` | - | `features/super_admin` | `test_super_customers` |
| catalog | business | `catalog_services.py`<br>`views/catalog.py` | `catalog_services.py` | - | `test_catalog`, `test_barcodes`, `test_product_stock_link` |
| pos | business | `order_services.py`<br>`models/orders.py`<br>`views/orders.py`<br>`views/pos/`<br>`views/viewsets.py`<br>`views/business_page_views/pages.py`<br>`views/dashboard/pos_section.py` | `order_services.py`<br>`views/dashboard/pos_section.py` | `features/business/pos` | `test_pos_day_summary`, `test_pos_actions` |
| inventory | business | `inventory_services.py`<br>`models/inventory.py`<br>`models/purchasing.py`<br>`models/sales.py`<br>`views/inventory/`<br>`views/warehouse/`<br>`views/invoicing/`<br>`views/helpers/`<br>`views/business_page_views/purchase_pages.py`<br>`views/dashboard/inventory_section.py` | `inventory_services.py`<br>`views/dashboard/inventory_section.py` | `features/business/inventory` | `test_inventory_flow`, `test_warehouse_access`, `test_warehouse_dispatch`, `test_warehouse_list_flag`, `test_invoicing_auth`, `test_addresses` |
| production | business | `production_engine.py`<br>`production_parser.py`<br>`production_services.py`<br>`models/production.py`<br>`views/production/` | `production_services.py` | `features/business/production`<br>`features/business/dictionary` | `test_production`, `test_production_routing`, `test_production_stock` |
| accounting | business | `accounting_autopilot.py`<br>`accounting_charts.py`<br>`accounting_fiscal.py`<br>`accounting_posting.py`<br>`accounting_reports.py`<br>`accounting_services.py`<br>`accounting_treasury.py`<br>`models/accounting.py`<br>`models/accounting_pro.py`<br>`views/accounting.py`<br>`views/accounting_auto.py`<br>`views/accounting_pro.py` | `accounting_services.py` | `features/business/accounting` | `test_accounting`, `test_accounting_pro`, `test_autopilot` |
| delivery | business | `delivery_routing.py`<br>`delivery_services.py`<br>`transport_services.py`<br>`models/delivery.py`<br>`views/delivery.py` | `delivery_services.py` | `features/business/delivery` | `test_delivery`, `test_delivery_api`, `test_delivery_generic`, `test_delivery_pos` |
| club | business | `club_analytics.py`<br>`club_campaigns.py`<br>`club_services.py`<br>`models/club.py`<br>`views/club.py`<br>`views/club_public.py` | `club_services.py` | `features/business/club`<br>`features/public/club` | `test_club`, `test_club_suite` |
| feedback | business | `models/feedback.py`<br>`views/feedback.py` | - | `features/business/feedback`<br>`features/public/feedback` | `test_feedback` |
| qr | business | `qr_services.py`<br>`models/qr.py`<br>`views/qr_order.py`<br>`views/qr_redirect.py`<br>`views/super_admin/qr.py` | - | `features/public`<br>`features/super_admin/qr` | `test_qr_flow`, `test_qr_links`, `test_qr_order` |
| card_terminal | business | `card_terminal/`<br>`models/card_terminal.py`<br>`views/card_reader.py` | `card_terminal/services.py` | - | `test_card_terminal` |
| support | business | `models/support.py`<br>`views/support.py`<br>`views/super_admin/support.py` | - | `features/business/support`<br>`features/super_admin/support` | `test_support` |
| dashboard | compose | `dashboard_summary.py`<br>`views/dashboard/` | - | `features/business/dashboard` | `test_industry_dashboard` |
| root | root | `urls.py`<br>`serializers.py`<br>`admin.py`<br>`apps.py`<br>`seeders.py`<br>`management/`<br>`__init__.py`<br>`models/__init__.py`<br>`views/__init__.py`<br>`views/business_page_views/__init__.py` | - | - | - |
<!-- END GENERATED:modules -->

## ۳. جهت وابستگی مجاز و ماژول‌هایی که با تغییر یک ماژول باید دوباره تست شوند

<!-- BEGIN GENERATED:deps -->
| module | may use (declared edges) | dependents re-tested with it |
|---|---|---|
| core | - | all |
| users | - | all |
| licensing | - | all |
| activity | - | all |
| superadmin | - | all |
| catalog | inventory, production | accounting, card_terminal, club, dashboard, delivery, pos, production, qr |
| pos | catalog, inventory, delivery, card_terminal | accounting, card_terminal, club, dashboard, delivery, qr |
| inventory | core only | accounting, card_terminal, catalog, club, dashboard, delivery, pos, production, qr |
| production | inventory, catalog | accounting, card_terminal, catalog, club, dashboard, delivery, pos, qr |
| accounting | inventory, pos | card_terminal, club, dashboard, delivery, inventory, pos, qr |
| delivery | accounting, pos | accounting, card_terminal, club, dashboard, pos, qr |
| club | inventory, pos | card_terminal, dashboard, inventory, pos |
| feedback | core only |  |
| qr | pos, catalog |  |
| card_terminal | pos, delivery | accounting, club, dashboard, delivery, pos, qr |
| support | core only |  |
| dashboard | pos, inventory, accounting, delivery, club, production |  |
<!-- END GENERATED:deps -->

قاعده‌ها (در `module_registry.edge_allowed` و تست اجرا می‌شوند):

1. هسته → ماژول کسب‌وکاری: ممنوع. کسب‌وکاری → هسته: آزاد.
2. کسب‌وکاری → کسب‌وکاری: فقط یال اعلام‌شده در `DEPENDS_ON`، فقط فایل‌های `public_api`، و هرگز مدل.
3. `requires` سخت در `modules.py` (مثلاً production ← inventory) باید یال اعلام‌شده باشد (تست می‌کند).
4. فایل‌های ریشهٔ ترکیب (`urls.py`، `serializers.py`، `admin.py`، `apps.py`، `management/`، `seeders.py`) از بررسی معافند و
   در بک‌لاگ هستند.

## ۴. رویدادهای دامنه (`bizsuite/events.py`)

همگام و درون‌پردازه؛ هندلر در همان تراکنش ناشر اجرا می‌شود (معنای `atomic` عوض نمی‌شود)، خطای هندلر لاگ و بلعیده
می‌شود (مثل `try/except` قبلی)، `publish` نتیجهٔ هندلرها را برمی‌گرداند (مثلاً نتیجهٔ ارسال پیک). ثبت هندلرها در
`apps.py → ready()`. هر رویداد باید در `module_registry.EVENTS` اعلام شود؛ تست ناشر/مشترک‌ها را با کد تطبیق می‌دهد.

<!-- BEGIN GENERATED:events -->
| event | publishers | subscribers | payload |
|---|---|---|---|
| `pos_order.paid` | pos, card_terminal | club, accounting | order, user |
| `pos_order.delivered` | pos | club | order |
| `pos_order.cancelled` | pos | accounting | order, user |
| `pos_order.dispatch_requested` | pos, card_terminal | delivery | order, driver_id, cod, user[, skip_if_dispatched]; returns dispatch dict |
| `sales_invoice.created` | inventory | accounting | obj, user |
| `sales_invoice.updated` | inventory | accounting | obj, user |
| `sales_invoice.deleted` | inventory | accounting | obj, user |
| `sales_invoice.finalized` | inventory | club | obj |
| `sales_return.created` | inventory | accounting | obj, user |
| `sales_return.deleted` | inventory | accounting | obj, user |
| `purchase_return.created` | inventory | accounting | obj, user |
| `purchase_return.deleted` | inventory | accounting | obj, user |
| `expense.created` | inventory | accounting | obj, user |
| `expense.deleted` | inventory | accounting | obj, user |
| `stock_waste.recorded` | inventory | accounting | movement, user |
<!-- END GENERATED:events -->

## ۵. تخلف‌ها (قبل ← بعد) به تفکیک جفت ماژول

اندازه‌گیری با همان جدول ماژول‌ها روی کد قبل از این کار (`96753ac`) و کد فعلی. «import خام بین ماژول‌ها» (هر import از
ماژول غیرهسته‌ای دیگر): **۱۲۹ در ۳۵ جفت ← ۱۰۲ در ۲۹ جفت**. «تخلف طبق قاعده» (baseline):
**۹۰ در ۳۲ جفت ← ۶۴ در ۲۵ جفت**.

| from -> to | قبل | بعد |
|---|---|---|
| inventory -> accounting | 12 | 1 |
| accounting -> inventory | 11 | 11 |
| users -> delivery | 9 | 9 |
| catalog -> inventory | 6 | 6 |
| production -> inventory | 5 | 5 |
| pos -> accounting | 4 | 0 |
| card_terminal -> pos | 3 | 2 |
| dashboard -> inventory | 3 | 3 |
| qr -> pos | 2 | 2 |
| dashboard -> delivery | 2 | 2 |
| card_terminal -> accounting | 2 | 0 |
| catalog -> production | 2 | 2 |
| delivery -> inventory | 2 | 2 |
| club -> inventory | 2 | 2 |
| delivery -> pos | 2 | 2 |
| pos -> inventory | 2 | 2 |
| delivery -> accounting | 2 | 1 |
| core -> accounting | 2 | 1 |
| pos -> club | 2 | 0 |
| dashboard -> accounting | 2 | 2 |
| dashboard -> club | 2 | 2 |
| accounting -> pos | 1 | 1 |
| card_terminal -> delivery | 1 | 0 |
| inventory -> delivery | 1 | 1 |
| dashboard -> production | 1 | 1 |
| users -> inventory | 1 | 1 |
| activity -> delivery | 1 | 1 |
| pos -> delivery | 1 | 0 |
| card_terminal -> club | 1 | 0 |
| dashboard -> pos | 1 | 1 |
| inventory -> club | 1 | 0 |
| club -> pos | 1 | 1 |

وضعیت فعلی (تولید خودکار؛ `python scripts/gen_module_docs.py --docs`):

<!-- BEGIN GENERATED:violations -->
| from | to | count |
|---|---|---|
| accounting | inventory | 11 |
| users | delivery | 9 |
| catalog | inventory | 6 |
| production | inventory | 5 |
| dashboard | inventory | 3 |
| card_terminal | pos | 2 |
| catalog | production | 2 |
| club | inventory | 2 |
| dashboard | accounting | 2 |
| dashboard | club | 2 |
| dashboard | delivery | 2 |
| delivery | inventory | 2 |
| delivery | pos | 2 |
| pos | inventory | 2 |
| qr | pos | 2 |
| accounting | pos | 1 |
| activity | delivery | 1 |
| club | pos | 1 |
| core | accounting | 1 |
| dashboard | pos | 1 |
| dashboard | production | 1 |
| delivery | accounting | 1 |
| inventory | accounting | 1 |
| inventory | delivery | 1 |
| users | inventory | 1 |
<!-- END GENERATED:violations -->

فهرست دقیق (فایل ← نام import شده) در `dashboard/bizsuite/module_violations_baseline.py` است.

### بک‌لاگ اولویت‌دار (تخمین زحمت: S ≈ نیم روز، M ≈ ۱–۲ روز، L ≈ ۳–۵ روز)

| # | کار | تخلف‌هایی که حذف می‌شود | زحمت |
|---|---|---|---|
| 1 | `dashboard`: هر ماژول بلوک خودش را (`dashboard_block(business, user)`) در public_api بدهد؛ dashboard فقط جمع کند | ۱۱ | M |
| 2 | accounting: «پورت خواندن سند» در public_api ماژول‌های inventory/pos (`invoice_lines(invoice)`، `order_lines(order)`، `parties()`) به‌جای ORM مستقیم | ۱۲ | M |
| 3 | users → delivery: رویداد `user.saved` / `user.approved` و هندلر در delivery برای ساخت پروفایل راننده | ۹ | S–M |
| 4 | catalog → inventory/production: API مانده/انبار مادر و فرمول‌ها در `inventory_services`/`production_services` | ۸ | M |
| 5 | production → inventory: توابع `get_raw_material(...)`/`mother_warehouse(...)` در inventory_services | ۵ | S |
| 6 | pos/qr/card_terminal/delivery/club ← Order/OrderItem: `order_services` (یا `order_api`) تابع خواندن/ساخت سفارش بدهد (`create_online_order`, `order_lines`) | ۹ | M–L |
| 7 | core → accounting (`industries.py` قالب سرفصل حساب) با رجیستری قالب‌ها که accounting پر می‌کند | ۱ | S |
| 8 | `serializers.py` (۸۳۰ خط، همهٔ ماژول‌ها) و `urls.py` به فایل‌های هر ماژول شکسته شود (ریشهٔ ترکیب فعلاً معاف است) | — | L |
| 9 | مدل‌ها: `UserWarehouse`، `models/sales.py` (Payment/TripStop) به ماژول مالک بروند | ۳ | S |
| 10 | کامپوننت‌های مشترک UI داخل فیچرها (`accounting/common`, …) به `@shared` بروند | ۴۱ هشدار ESLint | M |

## ۶. چطور باگ را فقط در یک ماژول رفع کنیم (قدم‌به‌قدم)

1. مالک را پیدا کنید: فایل را در جدول بالا یا در `docs/modules/<module>.md` ببینید
   (`python scripts/test_module.py --list`).
2. تست شکست‌خورده/جدید را در همان ماژول بنویسید (نام فایل در لیست `tests` ماژول در `module_registry.py`؛ اگر فایل
   تست جدید است همان‌جا ثبتش کنید – `python scripts/test_module.py --check` اگر ثبت نشود خطا می‌دهد).
3. فقط داخل فایل‌های مالک تغییر بدهید. اگر لازم شد از ماژول دیگری چیزی بخواهید: (الف) اثر جانبی؟ رویداد بسازید و در
   `EVENTS` اعلام کنید؛ (ب) خواندن/فرمان؟ تابع باریک در `public_api` همان ماژول و یال در `DEPENDS_ON`.
4. اجرای سریع: `python scripts/test_module.py <module> --only`.
5. قبل از commit: `python scripts/test_module.py <module>` (ماژول + وابسته‌ها و شریک‌های رویدادی) یا
   `python scripts/test_module.py --changed --base main` (از روی `git diff`، خودکار).
6. `tests/test_module_boundaries.py` باید سبز باشد. اگر تخلفی را برطرف کردید و تست «baseline دیگر وجود ندارد» خطا داد:
   `python scripts/gen_module_docs.py --baseline` را بزنید و فایل کوچک‌تر را commit کنید.
7. فرانت: `npm run lint` (قانون مرز فیچر) و `npm run build` در `web/`.
8. کارت ماژول‌ها را با `python scripts/gen_module_cards.py` و جدول‌ها را با `python scripts/gen_module_docs.py --docs` تازه کنید.

## ۷. فرانت‌اند: سطح عمومی هر فیچر

قانون ESLint (`web/eslint.boundaries.js`، قاعدهٔ `no-restricted-imports`): هر فیچر در `src/features/<scope>/<feature>` فقط
از `@shared`، پوشهٔ خودش و **سطح عمومی** فیچرهای دیگر import می‌کند. فایل‌هایی که امروز تخلف دارند در
`web/eslint.boundaries.baseline.js` هستند (برای آن‌ها قاعده «هشدار» است، پس تعداد خطاهای lint بالا نمی‌رود)؛ بقیه خطا.
بعد از اصلاح: `node scripts/gen-boundary-baseline.mjs`.

| فیچر | سطح عمومی (فایل‌هایی که دیگران مجازند import کنند) |
|---|---|
| business/accounting | `AccountingPage`, `api` |
| business/activity | `ActivityPage` |
| business/auth | `Login`, `ProtectedRoute` |
| business/club | `ClubPage`, `api` |
| business/dashboard | `dashboard`, `access`, `api` |
| business/delivery | `DispatchPage`, `DriverPage`, `TrackingPage`, `api` |
| business/dictionary | `Dictionary`, `StartChecklist`, `api` |
| business/feedback | `FeedbackPage`, `FeedbackDialog`, `api` |
| business/inventory | `InventoryPage`, `api` |
| business/layout | `BusinessLayout`, `SubscriptionGuard` |
| business/pos | `Pos`, `api` |
| business/production | `ProductionPage`, `api` |
| business/support | `SupportPage`, `api` |
| business/api, business/config | زیرساخت مشترک (آزاد) |
| super_admin/auth | `SuperLogin`, `SuperProtectedRoute` |
| super_admin/layout | `SuperAdminLayout` |
| super_admin/qr | `QrPanel` |
| super_admin/support | `SupportPanel`, `api` |
| super_admin/users | `UsersPanel` |
| super_admin/api, common, hooks | زیرساخت مشترک (آزاد) |
| public | صفحات عمومی؛ حق import از `business`/`super_admin` را ندارند |

`KbdHint` و `focus` از `pos/common` به `@shared/common` منتقل شدند (import های مرزی فرانت از ۸۰ به ۴۱ رسید).

## ۸. آنچه هنوز «سرویس واقعی» نیست

این معماری آمادهٔ جداسازی است، نه جداشده. برای جدا کردن واقعی یک ماژول (مثلاً accounting یا club) لازم است:
(الف) دیتابیس جدا برای هر ماژول و شکستن FKها (الان `Order`، `SalesInvoice`، `Customer` را همه با FK می‌خوانند — بک‌لاگ ۲ و ۶ لازم‌اند)،
(ب) تبدیل `events` درون‌پردازه به صف پیام (outbox + تحویل حداقل یک‌بار؛ هندلرها از قبل idempotent هستند)،
(ج) API Gateway / مسیریابی و سرویس احراز هویت جدا (JWT مشترک الان با `TenantMiddleware`)، (د) tenant در هر سرویس،
(هـ) جدا کردن deploy و مانیتورینگ. تخمین: هر ماژول ۲–۴ هفته پس از تمام‌شدن بک‌لاگ.
