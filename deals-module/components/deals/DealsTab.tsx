"use client";

import { useEffect, useMemo, useState } from "react";
import { getTopDeals } from "@/lib/deals/queries";
import {
  ARENA_LABEL,
  CULTURE_ARENAS,
  type ArenaView,
  type Deal,
  type TerritoryView,
} from "@/lib/deals/types";
import { DealRow } from "./DealRow";

const PAGE = 20;

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={
            value === o.id
              ? "rounded px-3 py-1.5 text-sm bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "rounded border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DealsTab() {
  const [arenaView, setArenaView] = useState<ArenaView>("sport");
  const [territoryView, setTerritoryView] = useState<TerritoryView>("anz");
  const [cultureArena, setCultureArena] = useState<string>("");
  const [search, setSearch] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);

  const filters = useMemo(
    () => ({
      arenaView,
      territoryView,
      cultureArena: arenaView === "culture" ? cultureArena || undefined : undefined,
      search: search.trim() || undefined,
    }),
    [arenaView, territoryView, cultureArena, search],
  );

  useEffect(() => {
    setOffset(0);
    setExhausted(false);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const t = setTimeout(async () => {
      const rows = await getTopDeals({ ...filters, limit: PAGE, offset });
      if (cancelled) return;
      setDeals((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      setExhausted(rows.length < PAGE);
      setLoading(false);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filters, offset]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle
          options={[
            { id: "sport", label: "Sport" },
            { id: "culture", label: "Culture" },
          ]}
          value={arenaView}
          onChange={(v) => setArenaView(v as ArenaView)}
        />
        <Toggle
          options={[
            { id: "anz", label: "ANZ" },
            { id: "global", label: "Global" },
          ]}
          value={territoryView}
          onChange={(v) => setTerritoryView(v as TerritoryView)}
        />
      </div>

      {arenaView === "culture" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCultureArena("")}
            className={
              cultureArena === ""
                ? "rounded border border-neutral-400 px-2.5 py-1 text-xs text-neutral-900 dark:border-neutral-500 dark:text-neutral-100"
                : "rounded border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
            }
          >
            All culture
          </button>
          {CULTURE_ARENAS.map((a) => (
            <button
              key={a}
              onClick={() => setCultureArena(a)}
              className={
                cultureArena === a
                  ? "rounded border border-neutral-400 px-2.5 py-1 text-xs text-neutral-900 dark:border-neutral-500 dark:text-neutral-100"
                  : "rounded border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
              }
            >
              {ARENA_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Nike, Cricket Australia, banking"
        className="mt-4 w-full rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-100"
      />

      {deals.length === 0 && !loading ? (
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          No deals match this view. Widen the date range or clear the search.
        </p>
      ) : (
        <ol className="mt-4 border-t border-neutral-200 dark:border-neutral-800">
          {deals.map((deal, i) => (
            <DealRow
              key={deal.id}
              deal={deal}
              rank={i + 1}
              showArenaChip={arenaView === "culture"}
            />
          ))}
        </ol>
      )}

      {loading && (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          Loading
        </p>
      )}

      {!loading && !exhausted && deals.length > 0 && (
        <button
          onClick={() => setOffset((o) => o + PAGE)}
          className="mt-4 rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
        >
          Load more
        </button>
      )}
    </div>
  );
}
