import {
  ARENA_LABEL,
  TERRITORY_LABEL,
  type Deal,
} from "@/lib/deals/types";
import { ValueBadge } from "./ValueBadge";

function relativeDate(iso: string) {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 28) return `${Math.floor(days / 7)}w ago`;
  return then.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function DealRow({
  deal,
  rank,
  showArenaChip,
}: {
  deal: Deal;
  rank: number;
  showArenaChip?: boolean;
}) {
  const c = deal.score_components;
  const breakdown = c
    ? [
        `Value ${Math.round(c.value)}`,
        `Brand ${Math.round(c.brand)}`,
        `Tier ${Math.round(c.tier)}`,
        `Rights ${Math.round(c.exclusivity)}`,
        `Recency x${c.decay}`,
      ].join("  ·  ")
    : "";

  return (
    <li className="flex gap-4 border-b border-neutral-200 py-3.5 dark:border-neutral-800">
      <span className="w-5 shrink-0 pt-0.5 text-sm tabular-nums text-neutral-400">
        {rank}
      </span>

      <div className="min-w-0 flex-1">
        <a
          href={deal.source_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] font-medium text-neutral-900 hover:underline dark:text-neutral-100"
        >
          {deal.brand_name} &times; {deal.property_name}
        </a>

        {deal.summary && (
          <p className="mt-0.5 truncate text-sm text-neutral-600 dark:text-neutral-400">
            {deal.summary}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {showArenaChip && (
            <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {ARENA_LABEL[deal.arena]}
            </span>
          )}
          <ValueBadge deal={deal} />
          <span className="text-xs text-neutral-500 dark:text-neutral-500">
            {relativeDate(deal.announced_on)} · {TERRITORY_LABEL[deal.territory]}
            {deal.source_name ? ` · ${deal.source_name}` : ""}
            {deal.is_renewal ? " · Renewal" : ""}
          </span>
        </div>
      </div>

      <span
        title={breakdown}
        className="shrink-0 pt-0.5 text-[15px] font-medium tabular-nums text-neutral-900 dark:text-neutral-100"
      >
        {Math.round(deal.score)}
      </span>
    </li>
  );
}
