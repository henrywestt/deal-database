# Deal radar

Sponsorship and partnership deals, ranked by size and recency. ANZ and global,
sport and culture. Pulls trade press daily, extracts structured records with
Claude, scores them, and shows a ranked top 10 with a searchable archive.

Next.js 15, Supabase, Vercel cron.

---

## Setup

### 1. Supabase

Create a project, then open the SQL editor and run in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

From Project settings, API, copy the project URL, the anon key, and the
service role key.

### 2. Anthropic

Get an API key from console.anthropic.com. Budget roughly A$0.50 to A$2 a day
depending on how many sources you run. The classifier uses Haiku and rejects
most articles before the expensive calls happen.

### 3. GitHub

```bash
git init
git add .
git commit -m "Deal radar"
git remote add origin git@github.com:YOURNAME/deal-radar.git
git push -u origin main
```

### 4. Vercel

Import the repo. Add these environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `ANTHROPIC_API_KEY` | Anthropic key |
| `CRON_SECRET` | Any long random string |
| `MAX_ARTICLES_PER_RUN` | `120` |

Deploy. `vercel.json` registers the cron at 19:00 UTC, which is 05:00 AEST in
winter and 06:00 in daylight saving. Vercel crons run on UTC only, so the local
time shifts by an hour twice a year. Adjust the schedule if that bothers you.

Vercel Hobby allows one cron a day. Pro allows more.

### 5. First run

Trigger it manually rather than waiting overnight:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/ingest
```

It returns a report: sources polled, articles seen, deals created, estimates
produced, estimates declined, and any errors. The first run backfills up to
14 days, so expect it to take a few minutes and produce more than a normal day.

---

## What to check after a week

**The declined estimate ratio.** `estimatesDeclined` should comfortably exceed
`estimatesProduced` on ANZ deals. If the model is estimating most undisclosed
deals, it is guessing and the prompt in `src/lib/anthropic.ts` needs tightening.

**Property tiers.** Every unknown property lands at tier 3. Tier is 20 percent
of the score and it feeds the fallback value for undisclosed deals, so a
wrongly tiered property distorts twice. Fix them in `deals_properties`.

**Brand profile scores.** Same problem, 25 percent of the score. Everything
unlisted sits at 50.

**Rejected articles.** Read `deals_articles` where `state = 'rejected'` and
check the classifier is not throwing away real deals. Adjust the qualifying
rules if it is.

**Dead feeds.** `deals_sources.last_error` records failures. Publishers kill
RSS endpoints without warning.

---

## Tuning the ranking

Weights live in the `deals_score_config` row, not in code, so retuning is an
update statement. Current split: value 40, brand 25, tier 20, exclusivity 15,
with a 9 day recency half life and a floor of 0.40.

`score_components` is stored on every deal, so after changing weights you can
recompute the archive rather than starting fresh. There is no recompute script
yet; the fastest version is a small route that reads every deal, calls
`scoreDeal` from `src/lib/scoring.ts`, and writes the result back.

Four decisions worth knowing about before you change anything:

**Value scores on a log scale.** Linear would compress everything under A$5m
into one band, which is most of the ANZ market.

**Undisclosed deals get a tier fallback, then lose 20 percent of it.** Without
the haircut an undisclosed tier 1 deal would outrank a confirmed A$2m deal.

**Estimates lose 10 percent against a confirmed figure of the same size.** An
inferred number should never beat a real one on a tie.

**Renewals lose 8 percent.** Less newsworthy than a new entrant, but still
worth knowing the category is taken.

---

## Manual value override

`POST /api/deals/{id}/value`

```json
{
  "low": 3000000,
  "high": 5000000,
  "currency": "AUD",
  "confidence": "estimated",
  "reason": "Confirmed range from the client team",
  "appliedBy": "henry"
}
```

Recomputes the score in place, marks the deal as overridden so the UI shows
"Adjusted" rather than "Estimated", and writes an audit row to
`deals_value_overrides`. This route uses the service role key, so put it behind
auth before anyone else has the URL.

---

## Lifting this into your existing dashboard

Everything is prefixed `deals_` except the `deals` table itself, so the schema
drops into an existing Supabase project without collisions. The three pieces
you need are `src/lib/scoring.ts`, `src/lib/pipeline.ts`, and
`src/components/DealBoard.tsx`. The cron route is nine lines of wrapper around
`runIngest`.

---

## Known gaps

No auth. Anyone with the URL can read the board, and the override route is
unprotected. Add Supabase Auth before sharing it.

No recompute script for weight changes.

No weekly rollup or export.

Paywalled sources return their teaser only. That is usually enough to classify
and often enough to extract, but figures below the fold are lost.

Category exclusivity is rarely stated in a release, so it defaults to false
rather than being guessed. It is the weakest of the four scoring inputs for
that reason.
