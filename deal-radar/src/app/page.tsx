import DealBoard from "@/components/DealBoard";
import { readClient } from "@/lib/supabase";
import { ANZ_TERRITORIES, type DealRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function topDeals(): Promise<DealRow[]> {
  try {
    const db = readClient();
    const { data } = await db
      .from("deals_ranked")
      .select("*")
      .in("territory", ANZ_TERRITORIES)
      .eq("arena", "sport")
      .order("score", { ascending: false })
      .limit(10);
    return (data ?? []) as DealRow[];
  } catch {
    return [];
  }
}

export default async function Page() {
  const deals = await topDeals();
  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "56px 24px 80px",
      }}
    >
      <DealBoard initial={deals} />
    </main>
  );
}
