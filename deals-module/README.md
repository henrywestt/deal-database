# Deals module

Drop-in sponsorship and partnership tracker for a Next.js App Router +
Supabase + Vercel dashboard. Read `CLAUDE.md` first.

## See the interface in five minutes

```bash
cp -r lib/deals      <your-app>/lib/
cp -r components/deals <your-app>/components/
cp -r app/api/deals  <your-app>/app/api/

psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```

Then mount the two components:

```tsx
// app/page.tsx, the daily view
import { DealsPanel } from "@/components/deals/DealsPanel";

<DealsPanel arenaView="sport" territoryView="anz" />

// app/deals/page.tsx, the full tab
import { DealsTab } from "@/components/deals/DealsTab";

export default function Page() {
  return <DealsTab />;
}
```

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
needed to view the seed data.

**The seed deals are fabricated.** Real brands and properties, invented
partnerships and invented figures. They exist so the layout can be judged
before the pipeline is built. `db/seed.sql` truncates and reloads, so run
it as often as you like, and truncate before the first live ingest.

## Going live

1. `npm install rss-parser cheerio` in the host app. `fetchSourceItems`
   in `lib/deals/ingest.ts` uses `rss-parser` for `method = 'rss'`
   sources and a Cheerio scraper for `method = 'scrape'` sources. The
   scraper is generic (headline links + article body text); sites with
   unusual markup may need a source-specific override.
2. Set `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
3. Deploy. `vercel.json` schedules the job at 19:00 UTC, which is
   05:00 AEST. Adjust for daylight saving if that matters to you.

Test the run locally before scheduling it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/deals/cron
```

## Retuning the score

Weights are a single row in `deals_score_config`. Edit the row, then
recompute the archive:

```ts
import { rescoreAll } from "@/lib/deals/ingest";
await rescoreAll();
```

Every deal stores `score_components`, so you can see what drove a ranking
before you change anything.

## Correcting a value

```bash
curl -X POST localhost:3000/api/deals/override \
  -H "content-type: application/json" \
  -d '{"dealId":"...","valueTotal":4500000,"currency":"AUD","termYears":3,"confidence":"confirmed","reason":"Figure confirmed in the annual report","appliedBy":"henry"}'
```

The previous state is written to `deals_value_overrides` and the deal is
rescored. Overridden values render as "Adjusted" rather than "Confirmed",
so a manual figure never passes itself off as a sourced one.

## What to watch in week one

- Estimator null rate. If it bands more than half the undisclosed ANZ
  deals, it is guessing and the prompt needs tightening.
- Classifier rejects. Skim `deals_articles` where `state = 'rejected'`
  for false negatives.
- Culture volume. Under two items a week means more gaming sources, not
  a looser classifier.
