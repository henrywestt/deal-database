import Link from "next/link";
import { countSince, getTopDeals } from "@/lib/deals/queries";
import type { ArenaView, TerritoryView } from "@/lib/deals/types";
import { DealRow } from "./DealRow";

// Server component. Drop this into the daily dashboard view.
export async function DealsPanel({
  arenaView = "sport",
  territoryView = "anz",
  limit = 10,
  href = "/deals",
}: {
  arenaView?: ArenaView;
  territoryView?: TerritoryView;
  limit?: number;
  href?: string;
}) {
  const deals = await getTopDeals({ arenaView, territoryView, limit });
  const since = new Date(Date.now() - 86_400_000);
  const newCount = await countSince(since);

  if (deals.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
          Deals
        </h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Nothing ingested yet. Run the cron job, or load the seed data to see
          the layout.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
            Deals
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {newCount} new in the last 24 hours
          </p>
        </div>
        <Link
          href={href}
          className="text-sm text-neutral-600 hover:underline dark:text-neutral-400"
        >
          See all
        </Link>
      </div>

      <ol className="mt-3 border-t border-neutral-200 dark:border-neutral-800">
        {deals.map((deal, i) => (
          <DealRow
            key={deal.id}
            deal={deal}
            rank={i + 1}
            showArenaChip={arenaView === "culture"}
          />
        ))}
      </ol>
    </section>
  );
}
