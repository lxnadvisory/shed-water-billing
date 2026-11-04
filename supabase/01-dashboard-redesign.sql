-- 01-dashboard-redesign.sql
-- Run once in the Supabase SQL editor. Safe to run anytime: it only ADDS
-- tables and columns, so nothing that works today stops working.
-- Running it twice is harmless.

begin;

-- 1. Remove the stale H1 2026 draft from the April test run ($10.32 at the old
--    water-only rate). The real H1 bill ($30.06) stays.
delete from billing
where cycle_label = 'H1 2026' and status = 'draft'
  and total_due = 10.32 and gallons_used = 1338;

-- 2. One bill per billing cycle from here on.
create unique index if not exists billing_cycle_label_key on billing (cycle_label);

-- 3. Store everything the invoice shows, plus sent/paid tracking.
alter table billing
  add column if not exists period_start   date,
  add column if not exists period_end     date,
  add column if not exists water_total    numeric(10,2),
  add column if not exists sewer_total    numeric(10,2),
  add column if not exists invoice_number text,
  add column if not exists invoice_url    text,
  add column if not exists sent_at        timestamptz,
  add column if not exists paid_at        timestamptz,
  add column if not exists paid_via       text;

-- 4. One row per rate period on each bill (the invoice's line items).
create table if not exists billing_lines (
  id               bigint generated always as identity primary key,
  billing_id       uuid not null references billing (id) on delete cascade,
  line_no          int  not null,
  period_start     date not null,
  period_end       date not null,
  start_reading    numeric not null,
  end_reading      numeric not null,
  gallons          numeric not null,
  water_rate       numeric(8,3) not null,
  sewer_city_rate  numeric(8,3) not null,
  sewer_mmsd_rate  numeric(8,3) not null,
  water_amount     numeric(10,2) not null,
  sewer_amount     numeric(10,2) not null,
  subtotal         numeric(10,2) not null,
  unique (billing_id, line_no)
);
alter table billing_lines enable row level security;
drop policy if exists "Public read billing_lines" on billing_lines;
create policy "Public read billing_lines" on billing_lines for select using (true);

-- 5. Rates by effective date: water Tier 2 + both sewer volume charges.
--    The billing script and the dashboard both read from here.
create table if not exists rate_periods (
  id              bigint generated always as identity primary key,
  effective_date  date not null unique,
  water_tier2     numeric(8,3) not null,
  sewer_city      numeric(8,3) not null,
  sewer_mmsd      numeric(8,3) not null,
  source          text,
  created_at      timestamptz default now()
);
alter table rate_periods enable row level security;
drop policy if exists "Public read rate_periods" on rate_periods;
create policy "Public read rate_periods" on rate_periods for select using (true);

insert into rate_periods (effective_date, water_tier2, sewer_city, sewer_mmsd, source) values
  ('2025-05-01', 6.10, 1.652, 3.770, 'City bill dated 3/13/2026 (water eff. 3/1/2023, sewer eff. 5/1/2025)'),
  ('2026-05-01', 7.71, 1.608, 4.036, 'City bill dated 10/14/2026 (water and sewer eff. 5/1/2026)')
on conflict (effective_date) do nothing;

-- 6. Venmo details for the Pay button and the "paid via" record.
alter table settings
  add column if not exists payer_venmo text,
  add column if not exists payee_venmo text,
  add column if not exists venmo_note  text default 'Shed water {cycle}';

update settings set
  payer_venmo = coalesce(payer_venmo, '@jake-aleckson'),
  payee_venmo = coalesce(payee_venmo, '@Stacey-Novogratz'),
  venmo_note  = coalesce(venmo_note,  'Shed water {cycle}')
where id = 1;

-- 7. Public storage bucket for invoice PDFs (linked from the dashboard).
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do nothing;

commit;

-- Check: should show one H1 2026 row ($30.06) and two rate periods.
select cycle_label, gallons_used, total_due, status from billing;
select effective_date, water_tier2, sewer_city, sewer_mmsd from rate_periods order by effective_date;
