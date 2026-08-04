import { NextResponse } from "next/server";
import { readClient } from "@/lib/supabase";
import { ANZ_TERRITORIES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region") ?? "anz";
  const tab = url.searchParams.get("tab") ?? "sport";
  const arena = url.searchParams.get("arena");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 100);

  const db = readClient();
  let query = db.from("deals_ranked").select("*");

  if (region === "anz") query = query.in("territory", ANZ_TERRITORIES);
  else query = query.not("territory", "in", `(${ANZ_TERRITORIES.join(",")})`);

  if (tab === "sport") query = query.eq("arena", "sport");
  else if (arena) query = query.eq("arena", arena);
  else query = query.neq("arena", "sport");

  if (q) {
    query = query.or(
      `brand_name.ilike.%${q}%,property_name.ilike.%${q}%,headline.ilike.%${q}%`,
    );
  }

  const { data, error } = await query
    .order("score", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deals: data ?? [] });
}
