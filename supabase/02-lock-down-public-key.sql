-- 02-lock-down-public-key.sql
-- Run ONLY AFTER all of these are done (see SETUP-DASHBOARD.md):
--   * SUPABASE_SERVICE_ROLE_KEY added as a GitHub Actions secret (shed-water-billing)
--   * serviceKey added to your local config.json
--   * SUPABASE_SERVICE_ROLE_KEY and ADMIN_PASSWORD added in Vercel, new dashboard deployed
--
-- Before this, the website's public key (visible to anyone who loads the site)
-- can read the admin password and change settings, bills, readings and agreements.
-- After this, the public key can only READ. All writes go through the private
-- service key, which lives only in GitHub secrets, Vercel and your PC.

begin;

drop policy if exists "Anon insert readings"     on readings;
drop policy if exists "Anon update settings"     on settings;
drop policy if exists "Anon insert rate_history" on rate_history;
drop policy if exists "Anon insert agreements"   on agreements;
drop policy if exists "Anon update agreements"   on agreements;
drop policy if exists "Anon insert changelog"    on settings_changelog;
drop policy if exists "Anon insert billing"      on billing;

-- The admin password now lives in Vercel (ADMIN_PASSWORD), not in a public table.
alter table settings drop column if exists admin_password;

commit;

-- Check: every remaining policy should be a read (SELECT).
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename;
