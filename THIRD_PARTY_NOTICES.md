# Third-party notices

This product includes or is derived from the third-party work listed below.
Only permissively licensed (MIT / BSD / Apache) code is adapted; projects under
GPL / AGPL / LGPL / proprietary licences were used for ideas only (no code copied).

## Club

### rfm — MIT License
- Source: https://github.com/sonwanesuresh95/rfm
- Used in: `dashboard/bizsuite/club_analytics.py` (`_quintile_scores`, `rfm_segment`)
- What: the RFM approach (1-5 equal-frequency scores on ranks, i.e. `pd.qcut(rank(method="first"), 5)`)
  and the score → segment table (Champions, Loyal, Promising, Potential loyalist, New active,
  Low spenders, Need attention, About to sleep, At risk, Lost). Re-written in plain Python without pandas.

```
MIT License

Copyright (c) 2022 The Python Packaging Authority

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

### Saleor — BSD 3-Clause License
- Source: https://github.com/saleor/saleor (`saleor/discount/models.py`, `Voucher`)
- Used in: `dashboard/bizsuite/models/club.py` (`LoyaltyCoupon`), `club_services.validate_coupon`
- What: the voucher field design only (usage limit, once-per-customer limit, start/end date,
  minimum spent, fixed vs percentage value). Implementation is our own.
- Copyright (c) 2020-2022, Saleor Commerce. Redistribution and use permitted under the
  BSD 3-Clause licence: https://github.com/saleor/saleor/blob/main/LICENSE

### Ideas only (no code copied)
- Open Loyalty (licence unclear / commercial): earning-rule types, tier levels with automatic downgrade,
  point expiry per lot.
- Odoo loyalty (LGPL-3 / OPL): rewards catalogue that converts points into a coupon.
- Twenty CRM, SuiteCRM (AGPL-3): customer segments and campaign targeting.
- Craft "Pointz" plugin (licence not stated): lot-based points ledger that expires and reverses correctly.
- Medusa (MIT, ideas only): promotion / campaign separation.
