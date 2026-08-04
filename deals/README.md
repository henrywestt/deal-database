# Deals

Sponsorship and partnership deals, ANZ and global, ranked by size and
recency. Next.js on Vercel, Postgres on Supabase, Claude for extraction.

Two views: ANZ and Global. Two tabs: Sport and Culture. Culture rows carry
an arena label so you can see whether you are looking at music, gaming,
film or wellness.

## Setup

### 1. Supabase

Create a project. In the SQL editor run, in this order:

```
supabase/schema.sql
supabase/seed-sources.sql
```

Copy the project URL, the anon key, and the service role key from
Settings, API.

### 2. Local

```bash
npm install
cp .env.example .env.local
# fill in .env.local
npm run dev
```

### 3. Vercel

Push to GitHub, then import the repo in Vercel. Add every variable from
`.env.example` under Settings, Environment Variables. `CRON_SECRET` and
`ADMIN_TOKEN` can be any long random string, for example
`openssl rand -hex 32`.

`vercel.json` registers a daily cron at 19:00 UTC, which is 05:00 AEST.
Vercel sends `Authorization: Bearer $CRON_SECRET` on that request, so set
`CRON_SECRET` or the route will run unauthenticated.

### 4. First run

Trigger it manually before waiting for the cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/ingest
```

It returns a run report. Check `errors` for dead feeds and deactivate
them:

```sql
update deals_sources set active = false where feed_url = '...';
```

## What the pipeline does

Polls active sources, inserts new articles, then for each pending article:

1. **Classify.** Cheap model. Is this a sponsorship deal announcement?
   Rejects roughly 80 percent.
2. **Extract.** Structured record. Nulls where the article does not say.
3. **Estimate.** Only where no value was disclosed. Given comparables
   from your own archive. Instructed to return null rather than guess.
4. **Score.** Deterministic, no model involved.

Deduplication happens on `brand + property + announcement month`. The
same deal from four outlets creates one record with four linked articles.

Every run also rescores the last 120 days, because the recency decay
means yesterday's scores are stale.

## Scoring

Weights, in your order of priority:

| Component | Weight |
|---|---|
| Value or estimate | 0.40 |
| Brand profile | 0.25 |
| Property tier | 0.20 |
| Category exclusivity | 0.15 |

Value is scored on a log scale between A$50k and A$50m annual, because
linear scaling would compress most of the ANZ market into one band.
Estimates take a 10 percent haircut against confirmed figures of the same
size. Undisclosed deals fall back to a tier-implied value and take a
further 20 percent haircut, so an undisclosed tier 1 deal does not
outrank a confirmed mid-size one on the value axis alone.

Recency then applies a multiplier: 1.00 today, 0.68 at seven days, 0.54
at fourteen, floored at 0.40. A large deal from last week still beats a
small one from this morning.

Weights live in the `deals_score_config` table, not in code. Change a row
and the next run rescores everything. `score_components` is stored on
every deal so you can see what drove a number.

## Manual value override

```bash
curl -X POST https://your-app.vercel.app/api/deals/override \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "deal_id": "uuid-here",
    "value_total": 4000000,
    "currency": "AUD",
    "term_years": 3,
    "confidence": "confirmed",
    "reason": "Figure confirmed in AFR piece",
    "applied_by": "henry"
  }'
```

The deal is flagged `value_overridden`, shows as "Adjusted" in the UI,
rescores immediately, and the previous state is written to
`deals_value_overrides`.

## Things to watch in week one

**The estimator's null rate.** If it produces bands for more than about
half the undisclosed ANZ deals, it is guessing and the prompt in
`src/lib/prompts.ts` needs tightening. Healthy looks like a lot of tier
labels and a few good bands.

**Classifier precision.** Read the `reject_reason` column on a sample of
rejected articles. If it is dropping real deals, loosen it. If campaign
launches are getting through, tighten it. Do not loosen it to fill the
culture tab.

**Function timeout.** Vercel Hobby caps functions at 60 seconds and this
route sets `maxDuration = 300`, which needs Pro. On Hobby, drop
`MAX_ARTICLES_PER_RUN` to about 8 and add more cron entries at staggered
times, since each run picks up whatever is still pending.

**Cost.** Roughly 300 to 600 classifier calls a week on cheap tokens,
plus 50 to 100 extraction and estimation calls on a mid model. Small.
The classifier is what keeps it that way, so do not skip it.

## Known gaps

Property newsrooms are not wired up because most do not publish RSS. They
are where quiet renewals live, so scrape support is the highest value
next addition.

The archive view caps at 100 rows with no pagination. Fine until it is
not.

There is no auth. Add Supabase Auth before sharing the URL with anyone at
Bastion, or put it behind Vercel password protection in the meantime.
