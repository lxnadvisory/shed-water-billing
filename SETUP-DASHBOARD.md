# Dashboard redesign: setup steps

Do these in order. Steps 1–6 don't change anything Tyler and Stacey can see.
Step 9 (the lock-down) comes last so nothing loses access partway through.

## 1. Add the new tables (Supabase, ~1 min)
Supabase → SQL Editor → paste all of `supabase/01-dashboard-redesign.sql` → Run.
The check at the bottom should show one H1 2026 bill ($30.06) and two rate periods.

## 2. Copy the private key (Supabase)
Project Settings → API Keys → **service_role** (secret) → Reveal → copy.
Treat it like a password: it goes only in the three places below.

## 3. Put the key in three places
- **GitHub** (shed-water-billing repo) → Settings → Secrets and variables → Actions →
  New repository secret: name `SUPABASE_SERVICE_ROLE_KEY`, value = the key.
- **Your PC**: in `shed-water-billing\config.json`, inside the `"supabase"` block, add
  `"serviceKey": "<the key>"` (comma after the line above it).
- **Vercel** (shed-dashboard project) → Settings → Environment Variables, add both,
  ticking **Production and Preview**:
  - `SUPABASE_SERVICE_ROLE_KEY` = the key
  - `ADMIN_PASSWORD` = a NEW admin password (the old one has been publicly readable)
  Also confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are ticked for Preview.

## 4. Push the billing changes (PowerShell)
```powershell
cd C:\Users\jalec\Downloads\shed-water-billing
git add src scripts .github supabase SETUP-DASHBOARD.md
git commit -m "Save bill line items, rates from Supabase, private key for writes"
git pull --rebase --autostash
git push
```

## 5. Re-save the H1 bill with its line items
```powershell
npm run bill
```
Expect $30.06 again, plus "Rates: from Supabase rate_periods" and an "Uploaded:" line for the PDF.

## 6. Push the dashboard to a preview branch (PowerShell)
```powershell
cd C:\Users\jalec\Downloads\shed-dashboard
git checkout -b dashboard-redesign
git rm components/TierBreakdown.tsx components/UsageChart.tsx
git add -A
git commit -m "Water dashboard redesign: cycle pages, date range, CSV, paid tracking"
git push -u origin dashboard-redesign
```
Vercel builds a preview link for the branch (Vercel dashboard → Deployments). Review it.

## 7. Go live
```powershell
git checkout main
git merge dashboard-redesign
git push
```

## 8. After you email the H1 bill
/admin → log in with the new password → H1 2026 → **Mark sent**. After Venmo → **Mark paid**.

## 9. Lock down the public key (Supabase)
Only after steps 3–7 are done: SQL Editor → paste `supabase/02-lock-down-public-key.sql` → Run.
Then check the next morning that the 6 AM "Daily Meter Reading" run is green.
