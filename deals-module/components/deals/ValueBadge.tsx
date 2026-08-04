import type { Deal } from "@/lib/deals/types";

const TIER_LABEL: Record<number, string> = {
  1: "Tier 1",
  2: "Tier 2",
  3: "Tier 3",
  4: "Tier 4",
  5: "Tier 5",
};

function money(n: number, currency: string) {
  const symbol =
    currency === "NZD"
      ? "NZ$"
      : currency === "USD"
        ? "US$"
        : currency === "GBP"
          ? "£"
          : currency === "EUR"
            ? "€"
            : "A$";

  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${symbol}${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`;
  }
  if (n >= 1_000) return `${symbol}${Math.round(n / 1_000)}k`;
  return `${symbol}${Math.round(n)}`;
}

// Confidence never shares a treatment with the figure itself. A reader
// should be able to tell a real number from a guess without reading a word.
export function ValueBadge({ deal }: { deal: Deal }) {
  const currency = deal.value_currency ?? "AUD";
  const per = deal.term_years && deal.term_years > 1 ? ` / ${deal.term_years} yrs` : "";

  if (deal.value_confidence === "confirmed" && deal.value_confirmed_total) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {deal.value_overridden ? "Adjusted" : "Confirmed"}
        </span>
        <span className="text-sm text-neutral-900 dark:text-neutral-100">
          {money(deal.value_confirmed_total, currency)}
          {per}
        </span>
      </span>
    );
  }

  if (
    deal.value_confidence === "estimated" &&
    deal.value_estimate_low &&
    deal.value_estimate_high
  ) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {deal.value_overridden ? "Adjusted" : "Estimated"}
        </span>
        <span className="text-sm text-neutral-900 dark:text-neutral-100">
          {money(deal.value_estimate_low, currency)} to{" "}
          {money(deal.value_estimate_high, currency)} / yr
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Undisclosed
      </span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        {TIER_LABEL[deal.property_tier ?? 3]}
      </span>
    </span>
  );
}
