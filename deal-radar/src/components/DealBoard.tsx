"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { relativeDate, territoryLabel, valueLabel } from "@/lib/format";
import {
  ARENA_LABELS,
  RIGHTS_LABELS,
  type Arena,
  type DealRow,
} from "@/lib/types";

type Region = "anz" | "global";
type Tab = "sport" | "culture";

const CULTURE_ARENAS: Arena[] = ["music", "film_tv", "gaming", "health_wellness"];

function ConfidenceChip({ deal }: { deal: DealRow }) {
  const map = {
    confirmed: {
      label: "Confirmed",
      fg: "var(--confirmed)",
      bg: "var(--confirmed-bg)",
    },
    estimated: {
      label: deal.value_overridden ? "Adjusted" : "Estimated",
      fg: "var(--estimated)",
      bg: "var(--estimated-bg)",
    },
    undisclosed: {
      label: "Not disclosed",
      fg: "var(--ink-mute)",
      bg: "var(--neutral-bg)",
    },
  } as const;
  const s = map[deal.value_confidence];
  return (
    <span
      className="num"
      style={{
        color: s.fg,
        background: s.bg,
        fontSize: 10.5,
        padding: "2px 7px",
        borderRadius: 3,
        letterSpacing: "0.02em",
      }}
    >
      {s.label}
    </span>
  );
}

// The score rail. Filled portion is underlying strength, ghost portion is
// what recency decay has taken off. Lets you see at a glance whether a deal
// ranks high because it is big or because it is fresh.
function ScoreRail({ deal }: { deal: DealRow }) {
  const base = deal.score_components?.base ?? deal.score;
  const decayed = Math.max(0, Math.min(100, base));
  const kept = Math.max(0, Math.min(100, deal.score));
  return (
    <div style={{ width: 52, flexShrink: 0, textAlign: "right" }}>
      <div
        className="num"
        style={{ fontSize: 19, color: "var(--ink)", lineHeight: 1.1 }}
      >
        {Math.round(deal.score)}
      </div>
      <div
        style={{
          marginTop: 6,
          height: 3,
          width: "100%",
          background: "var(--rule-soft)",
          position: "relative",
          borderRadius: 1,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${decayed}%`,
            background: "var(--score-ghost)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${kept}%`,
            background: "var(--score)",
          }}
        />
      </div>
    </div>
  );
}

function DealRowItem({ deal, rank }: { deal: DealRow; rank: number }) {
  return (
    <a
      href={deal.source_url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="row-link"
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        padding: "16px 4px",
        borderBottom: "1px solid var(--rule-soft)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span
        className="num"
        style={{
          width: 20,
          flexShrink: 0,
          fontSize: 12,
          color: "var(--ink-mute)",
          paddingTop: 4,
        }}
      >
        {String(rank).padStart(2, "0")}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="row-title"
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "-0.011em",
          }}
        >
          {deal.brand_name} <span style={{ color: "var(--ink-mute)" }}>×</span>{" "}
          {deal.property_name}
        </p>

        <p
          style={{
            margin: "4px 0 0",
            fontSize: 14,
            color: "var(--ink-soft)",
          }}
        >
          {deal.summary ?? deal.headline}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          <ConfidenceChip deal={deal} />
          <span className="num" style={{ fontSize: 13 }}>
            {valueLabel(deal)}
          </span>
          <span className="eyebrow">
            {relativeDate(deal.announced_on)} · {territoryLabel(deal.territory)} ·{" "}
            {RIGHTS_LABELS[deal.rights_type]}
            {deal.arena !== "sport" ? ` · ${ARENA_LABELS[deal.arena]}` : ""}
            {deal.source_name ? ` · ${deal.source_name}` : ""}
          </span>
        </div>
      </div>

      <ScoreRail deal={deal} />
    </a>
  );
}

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
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              fontSize: 13,
              padding: "5px 13px",
              borderRadius: 4,
              cursor: "pointer",
              border: "1px solid",
              borderColor: on ? "var(--ink)" : "var(--rule)",
              background: on ? "var(--ink)" : "transparent",
              color: on ? "var(--paper)" : "var(--ink-soft)",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function DealBoard({ initial }: { initial: DealRow[] }) {
  const [region, setRegion] = useState<Region>("anz");
  const [tab, setTab] = useState<Tab>("sport");
  const [arena, setArena] = useState<Arena | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [deals, setDeals] = useState<DealRow[]>(initial);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      region,
      tab,
      limit: showAll || query ? "60" : "10",
    });
    if (tab === "culture" && arena) params.set("arena", arena);
    if (query) params.set("q", query);
    try {
      const res = await fetch(`/api/deals?${params}`);
      const json = await res.json();
      setDeals(json.deals ?? []);
    } finally {
      setLoading(false);
    }
  }, [region, tab, arena, query, showAll]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const heading = useMemo(
    () => `${region === "anz" ? "ANZ" : "Global"} · ${tab === "sport" ? "Sport" : "Culture"}`,
    [region, tab],
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          paddingBottom: 18,
        }}
      >
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            {heading}
          </p>
          <h1
            style={{
              margin: "6px 0 0",
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.027em",
            }}
          >
            Deal radar
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Toggle
            options={[
              { id: "anz", label: "ANZ" },
              { id: "global", label: "Global" },
            ]}
            value={region}
            onChange={(v) => setRegion(v as Region)}
          />
          <Toggle
            options={[
              { id: "sport", label: "Sport" },
              { id: "culture", label: "Culture" },
            ]}
            value={tab}
            onChange={(v) => {
              setTab(v as Tab);
              setArena(null);
            }}
          />
        </div>
      </div>

      {tab === "culture" && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            paddingBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setArena(null)}
            style={chipStyle(arena === null)}
          >
            All
          </button>
          {CULTURE_ARENAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArena(a)}
              style={chipStyle(arena === a)}
            >
              {ARENA_LABELS[a]}
            </button>
          ))}
        </div>
      )}

      <div style={{ paddingBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search brand, property or headline"
          style={{
            width: "100%",
            fontSize: 14,
            padding: "9px 12px",
            border: "1px solid var(--rule)",
            borderRadius: 5,
            background: "var(--paper)",
            fontFamily: "inherit",
            color: "var(--ink)",
          }}
        />
      </div>

      <div
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 8,
          padding: "4px 20px 8px",
        }}
      >
        {deals.length === 0 && !loading && (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
              {query ? "No deals match that search" : "No deals here yet"}
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 14,
                color: "var(--ink-soft)",
              }}
            >
              {query
                ? "Try a brand or property name."
                : "Run the ingest job, or widen the region to Global."}
            </p>
          </div>
        )}

        {deals.map((d, i) => (
          <DealRowItem key={d.id} deal={d} rank={i + 1} />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 14,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="eyebrow">
          {loading ? "Loading" : `${deals.length} shown`}
        </span>
        {!query && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              background: "var(--paper)",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--ink-soft)",
            }}
          >
            {showAll ? "Show top 10" : "Show archive"}
          </button>
        )}
      </div>
    </div>
  );
}

function chipStyle(on: boolean): React.CSSProperties {
  return {
    fontSize: 12.5,
    padding: "4px 11px",
    borderRadius: 4,
    cursor: "pointer",
    border: "1px solid",
    borderColor: on ? "var(--ink-soft)" : "var(--rule)",
    background: on ? "var(--neutral-bg)" : "transparent",
    color: on ? "var(--ink)" : "var(--ink-mute)",
    fontFamily: "inherit",
  };
}
