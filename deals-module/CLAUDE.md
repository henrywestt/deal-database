# Deals module

A sponsorship and partnership deals tracker that drops into an existing
Next.js App Router + Supabase + Vercel dashboard. It ingests trade press
daily, extracts structured deal records, scores them, and surfaces a ranked
top 10.

## What this is for

Daily awareness of who is signing what, ANZ first, global second. Sport is
the primary arena. Music, film and TV, gaming, and health and wellness are
folded into a single Culture view with a category chip on each row.

## Run it with seed data first

The point of this scaffold is to look at the interface before committing to
the pipeline. `db/seed.sql` contains sources, brands, properties, and 18
illustrative deals with pre-computed scores. Load it and the UI renders
immediately. No API keys needed.

**The seed deals are invented for layout purposes. Do not treat any figure
in them as real. Wipe the table before the first live ingest.**

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```

Then mount `DealsTab` on a route and `DealsPanel` in the daily view.

## Design direction

This is a module inside an existing app, not a standalone product. Adopt
the host application's type scale, spacing, and colour tokens rather than
the Tailwind classes shipped here. The components use neutral utility
classes on purpose so they are easy to replace.

Three things should survive any restyle:

1. Value confidence is always visible next to the value. A confirmed
   figure, an estimated band, and an undisclosed tier must never look
   the same.
2. The score is shown but never explained inline. Hover reveals the
   component breakdown.
3. Rank order is the primary structure. Do not add a card grid.

## Architecture

```
db/schema.sql          Postgres schema, everything prefixed deals_
db/seed.sql            Sources, brands, properties, 18 sample deals

lib/deals/types.ts     Shared types
lib/deals/scoring.ts   Deterministic score. Pure function, no LLM.
lib/deals/config.ts    Loads score weights and FX from the database
lib/deals/supabase.ts  Service-role and browser clients
lib/deals/queries.ts   Read queries for the UI
lib/deals/llm.ts       The three Anthropic calls
lib/deals/ingest.ts    Pipeline orchestrator

app/api/deals/cron     Daily job, hit by Vercel cron at 05:00 AEST
app/api/deals/override Manual value correction, writes an audit row

components/deals/      DealsPanel, DealsTab, DealRow, ValueBadge
```

## Pipeline order

1. Poll every active row in `deals_sources`
2. Insert new articles, skip on `content_hash`
3. Classify each article, cheap model, rejects most of them
4. Build `dedupe_key` from brand + property + announcement month
5. If the key exists, attach the article to the existing deal and stop
6. Otherwise extract the full record
7. If no value was disclosed, run the estimator against comparables
8. Normalise to annual AUD, score, write

Deduping before extraction is deliberate. The same deal arrives from four
outlets and you should only pay for it once.

## Rules for the extraction layer

The estimator is the weakest link in the whole system and the prompts are
written to fight that. Do not loosen them to make the feed look fuller.

- Null is a correct answer. A fabricated band is worse than no band,
  because scoring treats it as real.
- Never infer a value the article does not support.
- Store every raw model response in `deals_articles.extraction_raw`.
  When a score looks wrong you need to see what came back.
- If the estimator returns a band for more than half the undisclosed ANZ
  deals, it is guessing. Tighten the prompt.

## Scoring

Weighted: value 40, brand profile 25, property tier 20, exclusivity 15,
then an exponential recency decay with a floor of 0.4. Weights live in
`deals_score_config` as a single row so they can be retuned without a
deploy. Every deal stores `score_components`, so the archive can be
recomputed after a weight change.

Value scores on a log scale between A$50k and A$50m. Linear would compress
most of the ANZ market into one band.

## Environment

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CRON_SECRET
```

## Dependencies

`fetchSourceItems` in `lib/deals/ingest.ts` uses `rss-parser` for
`method = 'rss'` sources and a Cheerio-based scraper for
`method = 'scrape'` sources. Add both to the host app:

```bash
npm install rss-parser cheerio
```

The scraper is a generic best-effort: it pulls headline links from
`article`/`h1`/`h2`/`h3` anchors on the listing page, then fetches each
article page for body text. Sites with unusual markup may need a
source-specific override.
