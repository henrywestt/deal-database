import type { Currency, DealRow } from "./types";

const SYMBOL: Record<Currency, string> = {
  AUD: "A$",
  NZD: "NZ$",
  USD: "US$",
  GBP: "£",
  EUR: "€",
};

function compact(n: number): string {
  if (n >= 1_000_000_000) return `${Math.round((n / 1_000_000_000) * 10) / 10}bn`;
  if (n >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

export function valueLabel(deal: DealRow): string {
  const sym = SYMBOL[deal.value_currency ?? "AUD"];
  const per = deal.term_years && deal.term_years > 1 ? ` / ${deal.term_years}yr` : "";

  if (deal.value_confidence === "confirmed" && deal.value_confirmed_total) {
    return `${sym}${compact(deal.value_confirmed_total)}${per}`;
  }
  if (
    deal.value_confidence === "estimated" &&
    deal.value_estimate_low &&
    deal.value_estimate_high
  ) {
    return `${sym}${compact(deal.value_estimate_low)}\u2013${compact(
      deal.value_estimate_high,
    )} / yr`;
  }
  return deal.property_tier ? `Tier ${deal.property_tier}` : "Not disclosed";
}

export function relativeDate(iso: string): string {
  const then = new Date(iso + "T00:00:00Z").getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function territoryLabel(t: string): string {
  if (t === "au") return "AU";
  if (t === "nz") return "NZ";
  if (t === "anz") return "ANZ";
  if (t === "uk") return "UK";
  if (t === "us") return "US";
  if (t === "eu") return "EU";
  if (t === "apac") return "APAC";
  if (t === "global") return "Global";
  return "Other";
}
