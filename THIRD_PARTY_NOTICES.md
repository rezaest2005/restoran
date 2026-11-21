# Third-party notices

This product is commercial software. Code is copied only from projects under permissive licenses
(MIT / BSD / Apache-2.0) and every such use is listed here. Projects under GPL / AGPL / LGPL or
source-available licenses were studied for ideas only; none of their code is included.

## Dashboard

### InvenTree — MIT License

- Source: https://github.com/inventree/InvenTree (`src/frontend/src/components/dashboard/`)
- License: MIT, Copyright (c) 2017 - InvenTree Developers
- What we took: the *pattern* of a declarative dashboard widget library. Each widget is a plain object
  (key, title, icon, render function) and a widget is shown only when its data / permission requirement is met.
  It was re-implemented from scratch for this codebase in
  `web/src/features/business/dashboard/home/kpiRegistry.js`, `home/KpiWidgets.jsx` and
  `dashboard/bizsuite/dashboard_summary.py` (`BLOCKS`). No source lines were copied.

```
MIT License

Copyright (c) 2017 - InvenTree Developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Ideas only (no code)

| Project | License | Idea used |
|---|---|---|
| ERPNext (frappe/erpnext) | GPL-3.0 | Setup-wizard "domains" (Manufacturing, Retail, Distribution, Services...) that decide which modules a company sees → our business-type presets (`dashboard/bizsuite/industries.py`). |
| Frappe Books (frappe/books) | AGPL-3.0 | Short first-run wizard where one choice (country) picks the starter chart of accounts → our preset `coa_template` key and the 3-step setup wizard. |
| Odoo Community | LGPL-3.0 (industry packages: Odoo Enterprise licence) | Onboarding banner / getting-started steps (company data, layout, first document) → our onboarding checklist; industry packages → preset terminology. |
| Akaunting | BSL 1.1 | Home dashboard of KPI widgets (receivables, cash) — reviewed, nothing taken beyond the general concept. |
