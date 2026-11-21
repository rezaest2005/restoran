# Browser scenarios (Playwright + Microsoft Edge)

Two end-to-end scenarios that sign in as a business owner and use the app like a real customer:

- `resto.js`: a restaurant/cafe that bought accounting, delivery and the customer club.
- `soap.js`: a liquid detergent factory that bought production, inventory and accounting.
  It defines a two-level production line, asks "how many can I make", runs the orders stage by stage and checks stock.

## Run

```bash
# 1. empty database, migrate, seed the two businesses (owner password: E2ePass123!)
docker exec deploy-db-1 createdb -U <db user> bizsuite_e2e
cd dashboard
DB_NAME=bizsuite_e2e python manage.py migrate
DB_NAME=bizsuite_e2e python manage.py shell -c "exec(open('../e2e/seed_e2e.py', encoding='utf-8').read())"
DB_NAME=bizsuite_e2e python manage.py runserver 127.0.0.1:8000

# 2. frontend
cd web && npx vite --port 5173

# 3. scenarios (needs playwright-core and Microsoft Edge)
cd e2e && npm i playwright-core@1.48.2
SHOTS=./shots node resto.js
SHOTS=./shots node soap.js
```

Each scenario is meant for a fresh database: the setup wizard only opens on the first visit and usernames/phones must be unique.
Screenshots go to `$SHOTS`. Every step prints PASS or FAIL and the run ends with a summary and any console/API errors.
