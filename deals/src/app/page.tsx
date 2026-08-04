import { readClient } from "@/lib/supabase";
import {
  ANZ_TERRITORIES,
  CULTURE_ARENAS,
  ARENA_LABEL,
  RIGHTS_LABEL,
  type DealRow,
  type Arena,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Region = "anz" | "global";
type Tab = "sport" | "culture";

interface SearchParams {
  region?: string;
  tab?: string;
  arena?: string;
  q?: string;
  view?: string;
}

function money(n: number | null, currency: string | null): string {
  if (n === null) return "";
  const symbol = currency === "NZD" ? "NZ$" : currency === "USD" ? "US$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "A$";
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1000) return `${symbol}${Math.round(n / 1000)}k`;
  return `${symbol}${Math.round(n)}`;
}

function valueLabel(d: DealRow): string {
  if (d.value_confidence === "confirmed" && d.value_confirmed_total) {
    const term = d.term_years && d.term_years > 1 ? ` / ${d.term_years} yrs` : "";
    return `${money(d.value_confirmed_total, d.value_currency)}${term}`;
  }
  if (d.value_confidence === "estimated" && d.value_estimate_low && d.value_estimate_high) {
    return `${money(d.value_estimate_low, d.value_currency)} to ${money(d.value_estimate_high, d.value_currency)} / yr`;
  }
  return d.property_tier ? `Tier ${d.property_tier}` : "Not disclosed";
}

function ago(dateStr: string): string {
  const days = Math.floor((Date.now() - Date.parse(dateStr)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function qs(params: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...params, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

async function getDeals(region: Region, tab: Tab, arena: string | undefined, q: string | undefined, limit: number) {
  const db = readClient();
  let query = db.from("deals_ranked").select("*");

  if (region === "anz") query = query.in("territory", ANZ_TERRITORIES);
  else query = query.not("territory", "in", `(${ANZ_TERRITORIES.join(",")})`);

  if (tab === "sport") query = query.eq("arena", "sport");
  else if (arena && CULTURE_ARENAS.includes(arena as Arena)) query = query.eq("arena", arena);
  else query = query.in("arena", CULTURE_ARENAS);

  if (q) query = query.or(`brand_name.ilike.%${q}%,property_name.ilike.%${q}%,headline.ilike.%${q}%`);

  const { data, error } = await query.order("score", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as DealRow[];
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const region: Region = searchParams.region === "global" ? "global" : "anz";
  const tab: Tab = searchParams.tab === "culture" ? "culture" : "sport";
  const arena = searchParams.arena;
  const q = searchParams.q?.trim() || undefined;
  const showAll = searchParams.view === "all" || Boolean(q);
  const limit = showAll ? 100 : 10;

  let deals: DealRow[] = [];
  let loadError: string | null = null;
  try {
    deals = await getDeals(region, tab, arena, q, limit);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main>
      <header className="head">
        <div>
          <h1>Deals</h1>
          <p className="muted">
            {region === "anz" ? "Australia and New Zealand" : "Rest of world"} ·{" "}
            {tab === "sport" ? "Sport" : "Culture"} · ranked by size and recency
          </p>
        </div>
        <nav className="pills">
          <a className={region === "anz" ? "pill on" : "pill"} href={qs(searchParams, { region: "anz", view: undefined })}>ANZ</a>
          <a className={region === "global" ? "pill on" : "pill"} href={qs(searchParams, { region: "global", view: undefined })}>Global</a>
        </nav>
      </header>

      <nav className="tabs">
        <a className={tab === "sport" ? "tab on" : "tab"} href={qs(searchParams, { tab: "sport", arena: undefined, view: undefined })}>Sport</a>
        <a className={tab === "culture" ? "tab on" : "tab"} href={qs(searchParams, { tab: "culture", arena: undefined, view: undefined })}>Culture</a>
      </nav>

      {tab === "culture" && (
        <nav className="chips">
          <a className={!arena ? "chip on" : "chip"} href={qs(searchParams, { arena: undefined })}>All</a>
          {CULTURE_ARENAS.map((a) => (
            <a key={a} className={arena === a ? "chip on" : "chip"} href={qs(searchParams, { arena: a })}>
              {ARENA_LABEL[a]}
            </a>
          ))}
        </nav>
      )}

      <form className="search" action="/" method="get">
        <input type="hidden" name="region" value={region} />
        <input type="hidden" name="tab" value={tab} />
        {arena && <input type="hidden" name="arena" value={arena} />}
        <input type="search" name="q" placeholder="Search brand, property or headline" defaultValue={q ?? ""} />
        <button type="submit">Search</button>
      </form>

      {loadError && <p className="error">Could not load deals: {loadError}</p>}

      {!loadError && deals.length === 0 && (
        <p className="empty">
          {q ? "Nothing matches that search." : "No deals yet. Run the ingest job to populate this view."}
        </p>
      )}

      <ol className="list">
        {deals.map((d, i) => (
          <li key={d.id} className="row">
            <span className="rank">{i + 1}</span>
            <div className="body">
              <p className="title">
                {d.source_url ? (
                  <a href={d.source_url} target="_blank" rel="noreferrer">
                    {d.brand_name} × {d.property_name}
                  </a>
                ) : (
                  <>{d.brand_name} × {d.property_name}</>
                )}
              </p>
              <p className="sub">
                {d.summary || d.headline}
                {d.category ? ` · ${d.category}` : ""}
              </p>
              <p className="meta">
                <span className={`flag ${d.value_confidence}`}>
                  {d.value_overridden ? "Adjusted" : d.value_confidence === "confirmed" ? "Confirmed" : d.value_confidence === "estimated" ? "Estimated" : "Undisclosed"}
                </span>
                <span className="val">{valueLabel(d)}</span>
                <span className="dim">
                  {ago(d.announced_on)} · {d.territory.toUpperCase()} · {RIGHTS_LABEL[d.rights_type]}
                  {d.is_renewal ? " · Renewal" : ""}
                  {d.source_name ? ` · ${d.source_name}` : ""}
                  {tab === "culture" ? ` · ${ARENA_LABEL[d.arena]}` : ""}
                </span>
              </p>
            </div>
            <span className="score">{Math.round(d.score)}</span>
          </li>
        ))}
      </ol>

      {!showAll && deals.length >= 10 && (
        <p className="more">
          <a href={qs(searchParams, { view: "all" })}>Show full archive</a>
        </p>
      )}
    </main>
  );
}
