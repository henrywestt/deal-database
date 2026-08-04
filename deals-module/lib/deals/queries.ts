import { readClient } from "./supabase";
import {
  ANZ_TERRITORIES,
  CULTURE_ARENAS,
  type ArenaView,
  type Deal,
  type TerritoryView,
} from "./types";

export interface DealFilters {
  arenaView: ArenaView;
  territoryView: TerritoryView;
  search?: string;
  cultureArena?: string; // narrow within Culture
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

function applyScope(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  f: DealFilters,
) {
  if (f.arenaView === "sport") {
    q = q.eq("arena", "sport");
  } else if (f.cultureArena) {
    q = q.eq("arena", f.cultureArena);
  } else {
    q = q.in("arena", CULTURE_ARENAS);
  }

  if (f.territoryView === "anz") {
    q = q.in("territory", ANZ_TERRITORIES);
  } else {
    q = q.not("territory", "in", `(${ANZ_TERRITORIES.join(",")})`);
  }

  if (f.from) q = q.gte("announced_on", f.from);
  if (f.to) q = q.lte("announced_on", f.to);

  if (f.search) {
    const s = `%${f.search}%`;
    q = q.or(
      `brand_name.ilike.${s},property_name.ilike.${s},headline.ilike.${s},category.ilike.${s}`,
    );
  }

  return q;
}

export async function getTopDeals(f: DealFilters): Promise<Deal[]> {
  let q = readClient().from("deals_ranked").select("*");
  q = applyScope(q, f);

  const { data, error } = await q
    .order("score", { ascending: false })
    .range(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 10) - 1);

  if (error) {
    console.error("getTopDeals failed:", error.message);
    return [];
  }
  return (data ?? []) as Deal[];
}

export async function countDeals(f: DealFilters): Promise<number> {
  let q = readClient()
    .from("deals_ranked")
    .select("id", { count: "exact", head: true });
  q = applyScope(q, f);

  const { count, error } = await q;
  if (error) {
    console.error("countDeals failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function countSince(since: Date): Promise<number> {
  const { count } = await readClient()
    .from("deals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  return count ?? 0;
}
