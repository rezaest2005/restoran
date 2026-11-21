# Third-party notices

This file lists third-party source code that is included in this product, and the open-source projects
whose ideas informed parts of it. Code is copied only from permissively licensed projects (MIT, BSD, Apache-2.0);
projects under GPL, AGPL or LGPL are used as a source of ideas only — none of their code is included.

## Accounting

### Code included

No third-party source code is included in the accounting module. Everything in
`dashboard/bizsuite/accounting_*.py`, `dashboard/bizsuite/models/accounting*.py`,
`dashboard/bizsuite/views/accounting*.py` and `web/src/features/business/accounting/` was written for this product.

### Ideas and conventions (no code taken)

| Project | License | What informed the design |
|---|---|---|
| [django-hordak](https://github.com/adamcharnock/django-hordak) | MIT (Copyright (c) 2016 Adam Charnock) | Integrity rules enforced in the data layer (every leg one-sided, transactions must balance), account trees with type/sign inherited from the root. |
| [python-accounting](https://github.com/ekmungai/python-accounting) | MIT (Copyright (c) 2024 Edward Mungai) | Reporting periods with open/closed status, posting blocked in closed periods, IFRS-style statement sections. |
| [ERPNext / Frappe](https://github.com/frappe/erpnext) | GPL-3.0 | Ideas only: draft → submitted → cancelled (by reversal) voucher lifecycle, "Accounting Period" locks, period-closing voucher. |
| [Odoo `account`](https://github.com/odoo/odoo) | LGPL-3.0 | Ideas only: lock dates, bank-statement reconciliation by amount/date matching, fiscal positions for tax. |
| [GnuCash](https://github.com/Gnucash/gnucash) | GPL-2.0+ | Ideas only: reconcile window (statement ending balance vs. cleared items). |
| [hledger](https://github.com/simonmichael/hledger) / [Beancount](https://github.com/beancount/beancount) | GPL-3.0 / GPL-2.0 | Ideas only: balance assertions, report depth (summarise a trial balance at a chosen account level). |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | AGPL-3.0 | Ideas only: budgets compared against actual spending per period. |
| [Frappe Books](https://github.com/frappe/books) | AGPL-3.0 | Ideas only: small-business-friendly setup with an industry chart of accounts chosen at start. |
| [django-ledger](https://github.com/arrobalytics/django-ledger) | GPL-3.0 | Ideas only: entity-scoped ledgers, closing entries per fiscal year. |
| [Bigcapital](https://github.com/bigcapitalhq/bigcapital) | AGPL-3.0 | Ideas only: receivable/payable aging buckets, cash-flow statement grouping. |
| [Akaunting](https://github.com/akaunting/akaunting) | BSL-1.1 (source-available, not open source) | Ideas only: bank transfers between accounts with a fee. |

Iranian accounting conventions (کدینگ گروه/کل/معین/تفصیلی، سند اختتامیه و افتتاحیه، تراز دو/چهار/شش ستونی،
چک دریافتنی/پرداختنی و شناسه‌ی صیادی، مالیات بر ارزش افزوده) follow common public practice and Persian
accounting literature; no copyrighted chart of accounts was copied.
