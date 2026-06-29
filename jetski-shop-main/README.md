# Jet Ski Shop — Management App

A full work-order, time-tracking, lake-testing, mileage, and payroll app for a small
jet ski repair shop. Real accounts, roles, and a real database.

## What's inside
- **Accounts & roles** — Owner / Manager / Tech, with manager approval for new signups
- **Work orders** — customer + ski details, priority ranking, status pipeline, parts, photos & video
- **Lake testing** — its own timer and pass/fail run log inside each job
- **Shop time clock** — clocking out auto-stops a tech's running job timers
- **Mileage** — live GPS tracking + manual entry, reimbursement totals
- **Payroll** — regular/OT hours from shifts + mileage, gross-pay worksheet, CSV export
- **Settings** — mileage rate, overtime threshold and multiplier

Who can see what: techs use work orders, the time clock, and their own mileage.
Managers and owners also get payroll, crew management, pay rates, and settings.
Only owners can promote people to manager or owner.

---

## Setup (about 30–45 min the first time)

### 1. Create a Supabase project
1. Go to supabase.com, sign up, click **New project**.
2. Pick a name and a strong database password (save it). Wait ~2 min for it to spin up.

### 2. Build the database
1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
3. Go to **Storage → New bucket**, name it exactly `job-media`, and tick **Public bucket**.
4. Back in SQL Editor, run the two storage policies at the bottom of `schema.sql`
   (they're after the `STORAGE` comment) if they didn't run with the rest.

### 3. Get your keys
**Project Settings → API**, copy:
- **Project URL**
- **anon public** key

### 4. Run it locally
You need [Node.js](https://nodejs.org) (LTS) installed.
```bash
cd jetski-shop
cp .env.example .env        # then edit .env and paste your two keys
npm install
npm run dev
```
Open the link it prints (usually http://localhost:5173).

### 5. Make yourself the owner
1. In the running app, click **Create an account** and sign up with your email.
2. Back in Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'owner', active = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Sign in. You now see every tab.

### 6. Put it online (so the crew can use it on their phones)
1. Push this folder to a GitHub repo.
2. At vercel.com (or netlify.com), import the repo.
3. In the host's **Environment Variables**, add the same `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from your `.env`.
4. Deploy. Share the URL. Crew sign up, you approve them in **Crew**.

---

## Notes & honest limits
- **GPS** runs only while the Mileage page is open (browsers can't track in the
  background). Manual entry is always available as a fallback.
- **Payroll** produces gross pay (hours × rate + OT + mileage). It does **not**
  calculate tax withholding — hand the CSV to your payroll provider or accountant.
- **Email confirmation**: by default Supabase emails a confirmation link on signup.
  To skip that while testing, turn off "Confirm email" under
  Authentication → Providers → Email.
- Set each person's **pay rate** in the Crew screen and your **OT rules** in Settings
  before running payroll, or pay columns show "set rate".
- Free tiers (Supabase + Vercel) are plenty for a small shop. If you outgrow them or
  want a phone app with background GPS, that's a later step.

## Security model
The database enforces permissions itself (Postgres Row Level Security), not just the
app — so a tech can't read pay rates or run payroll even if they poked at the code.
Roles and approvals are enforced by database triggers and policies in `schema.sql`.
