import type { SupabaseClient } from "@supabase/supabase-js";
import { classify, estimate, extract } from "./anthropic";
import { fetchArticleBody, fetchFeed, hashContent } from "./rss";
import { DEFAULT_CONFIG, scoreDeal, toAnnualAud, type ScoreConfig } from "./scoring";
import type { Currency, ExtractorResult } from "./types";

export interface RunReport {
  sourcesPolled: number;
  sourcesFailed: number;
  articlesSeen: number;
  articlesNew: number;
  classified: number;
  rejected: number;
  dealsCreated: number;
  dealsMerged: number;
  estimatesProduced: number;
  estimatesDeclined: number;
  errors: string[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function dedupeKey(
  brand: string,
  property: string,
  announcedOn: string,
): string {
  return `${slug(brand)}|${slug(property)}|${announcedOn.slice(0, 7)}`;
}

async function loadConfig(db: SupabaseClient): Promise<ScoreConfig> {
  const { data } = await db.from("deals_score_config").select("*").eq("id", 1).single();
  if (!data) return DEFAULT_CONFIG;
  return {
    weightValue: Number(data.weight_value),
    weightBrand: Number(data.weight_brand),
    weightTier: Number(data.weight_tier),
    weightExclusivity: Number(data.weight_exclusivity),
    decayFloor: Number(data.decay_floor),
    decayHalfLifeDays: Number(data.decay_half_life_days),
    valueFloorAud: Number(data.value_floor_aud),
    valueCeilingAud: Number(data.value_ceiling_aud),
    estimatePenalty: Number(data.estimate_penalty),
  };
}

async function loadFx(db: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await db.from("deals_fx_rates").select("currency, aud_per_unit");
  const fx: Record<string, number> = { AUD: 1 };
  for (const row of data ?? []) fx[row.currency] = Number(row.aud_per_unit);
  return fx;
}

// Brands and properties are upserted on first sight with default scores.
// Correct them by hand later; the scorer reads whatever is in the table.
async function upsertBrand(
  db: SupabaseClient,
  name: string,
  parent: string | null,
  category: string | null,
): Promise<{ id: string; profile_score: number }> {
  const { data: existing } = await db
    .from("deals_brands")
    .select("id, profile_score")
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing as { id: string; profile_score: number };

  const { data } = await db
    .from("deals_brands")
    .insert({ name, parent_company: parent, category })
    .select("id, profile_score")
    .single();
  return (data as { id: string; profile_score: number }) ?? { id: "", profile_score: 50 };
}

async function upsertProperty(
  db: SupabaseClient,
  name: string,
  arena: string,
  territory: string,
): Promise<{ id: string; tier: number }> {
  const { data: existing } = await db
    .from("deals_properties")
    .select("id, tier")
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing as { id: string; tier: number };

  const { data } = await db
    .from("deals_properties")
    .insert({ name, arena, territory })
    .select("id, tier")
    .single();
  return (data as { id: string; tier: number }) ?? { id: "", tier: 3 };
}

async function comparablesFor(
  db: SupabaseClient,
  arena: string,
  territory: string,
  tier: number,
): Promise<string[]> {
  const { data } = await db
    .from("deals")
    .select(
      "brand_name, property_name, rights_type, value_annual_aud, value_currency, announced_on",
    )
    .eq("arena", arena)
    .eq("territory", territory)
    .eq("value_confidence", "confirmed")
    .not("value_annual_aud", "is", null)
    .order("announced_on", { ascending: false })
    .limit(8);

  return (data ?? []).map(
    (d) =>
      `${d.brand_name} x ${d.property_name} | tier ${tier} | ${d.rights_type} | A$${Number(
        d.value_annual_aud,
      ).toLocaleString("en-AU")} per year | ${d.announced_on}`,
  );
}

export async function runIngest(
  db: SupabaseClient,
  maxArticles: number,
): Promise<RunReport> {
  const report: RunReport = {
    sourcesPolled: 0,
    sourcesFailed: 0,
    articlesSeen: 0,
    articlesNew: 0,
    classified: 0,
    rejected: 0,
    dealsCreated: 0,
    dealsMerged: 0,
    estimatesProduced: 0,
    estimatesDeclined: 0,
    errors: [],
  };

  const cfg = await loadConfig(db);
  const fx = await loadFx(db);

  const { data: sources } = await db
    .from("deals_sources")
    .select("*")
    .eq("active", true);

  // Stage one: pull feeds, write new articles only.
  for (const source of sources ?? []) {
    report.sourcesPolled++;
    try {
      const items = await fetchFeed(source.feed_url);
      report.articlesSeen += items.length;

      const fresh = items.filter((i) => {
        if (!i.publishedAt) return true;
        const age = Date.now() - new Date(i.publishedAt).getTime();
        return age < 14 * 86_400_000;
      });

      for (const item of fresh.slice(0, 40)) {
        const { error } = await db.from("deals_articles").insert({
          source_id: source.id,
          url: item.url,
          headline: item.headline,
          published_at: item.publishedAt,
          body_text: item.summary,
          content_hash: hashContent(item.headline + item.url),
        });
        if (!error) report.articlesNew++;
      }

      await db
        .from("deals_sources")
        .update({ last_polled_at: new Date().toISOString(), last_error: null })
        .eq("id", source.id);
    } catch (e) {
      report.sourcesFailed++;
      const msg = e instanceof Error ? e.message : String(e);
      report.errors.push(`${source.name}: ${msg}`);
      await db
        .from("deals_sources")
        .update({ last_polled_at: new Date().toISOString(), last_error: msg })
        .eq("id", source.id);
    }
  }

  // Stage two: classify, extract, score.
  const { data: pending } = await db
    .from("deals_articles")
    .select("*, deals_sources(name, trust_weight)")
    .eq("state", "pending")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(maxArticles);

  for (const article of pending ?? []) {
    const sourceName =
      (article.deals_sources as { name?: string } | null)?.name ?? "unknown";

    try {
      let body: string = article.body_text ?? "";
      if (body.length < 400) {
        const fetched = await fetchArticleBody(article.url);
        if (fetched.length > body.length) body = fetched;
      }

      const verdict = await classify({
        headline: article.headline,
        publishedAt: article.published_at,
        sourceName,
        bodyText: body,
      });
      report.classified++;

      if (!verdict?.qualifies) {
        report.rejected++;
        await db
          .from("deals_articles")
          .update({
            state: "rejected",
            reject_reason: verdict?.reason ?? "classifier returned nothing",
            processed_at: new Date().toISOString(),
          })
          .eq("id", article.id);
        continue;
      }

      const record = await extract({
        headline: article.headline,
        publishedAt: article.published_at,
        sourceName,
        bodyText: body,
      });

      if (!record?.brand_name || !record?.property_name) {
        await db
          .from("deals_articles")
          .update({
            state: "failed",
            reject_reason: "extraction incomplete",
            extraction_raw: record ?? null,
            processed_at: new Date().toISOString(),
          })
          .eq("id", article.id);
        continue;
      }

      const announcedOn =
        record.announced_on ??
        (article.published_at ?? new Date().toISOString()).slice(0, 10);
      const key = dedupeKey(record.brand_name, record.property_name, announcedOn);

      const { data: existing } = await db
        .from("deals")
        .select("id")
        .eq("dedupe_key", key)
        .maybeSingle();

      if (existing) {
        await db.from("deals_deal_articles").insert({
          deal_id: existing.id,
          article_id: article.id,
          is_primary: false,
        });
        await db
          .from("deals_articles")
          .update({
            state: "merged",
            extraction_raw: record,
            processed_at: new Date().toISOString(),
          })
          .eq("id", article.id);
        report.dealsMerged++;
        continue;
      }

      const brand = await upsertBrand(
        db,
        record.brand_name,
        record.brand_parent,
        record.brand_category,
      );
      const property = await upsertProperty(
        db,
        record.property_name,
        record.arena,
        record.territory,
      );

      const scored = await buildAndScore(
        db,
        record,
        announcedOn,
        brand.profile_score,
        property.tier,
        fx,
        cfg,
        report,
      );

      const { data: created } = await db
        .from("deals")
        .insert({
          brand_id: brand.id || null,
          property_id: property.id || null,
          brand_name: record.brand_name,
          property_name: record.property_name,
          arena: record.arena,
          territory: record.territory,
          rights_type: record.rights_type,
          category_exclusive: record.category_exclusive === true,
          category: record.brand_category ?? record.category,
          headline: article.headline,
          summary: record.summary,
          announced_on: announcedOn,
          term_start: record.term_start,
          term_end: record.term_end,
          term_years: record.term_years,
          value_currency: scored.currency,
          value_confirmed_total: record.value_total,
          value_estimate_low: scored.estimateLow,
          value_estimate_high: scored.estimateHigh,
          value_confidence: scored.confidence,
          value_annual_aud: scored.annualAud,
          score: scored.score,
          score_components: scored.components,
          is_renewal: record.is_renewal === true,
          dedupe_key: key,
        })
        .select("id")
        .single();

      if (created) {
        await db.from("deals_deal_articles").insert({
          deal_id: created.id,
          article_id: article.id,
          is_primary: true,
        });
        report.dealsCreated++;
      }

      await db
        .from("deals_articles")
        .update({
          state: "classified",
          extraction_raw: record,
          processed_at: new Date().toISOString(),
        })
        .eq("id", article.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.errors.push(`article ${article.id}: ${msg}`);
      await db
        .from("deals_articles")
        .update({
          state: "failed",
          reject_reason: msg,
          processed_at: new Date().toISOString(),
        })
        .eq("id", article.id);
    }
  }

  return report;
}

async function buildAndScore(
  db: SupabaseClient,
  record: ExtractorResult,
  announcedOn: string,
  brandProfile: number,
  propertyTier: number,
  fx: Record<string, number>,
  cfg: ScoreConfig,
  report: RunReport,
) {
  let currency: Currency | null = record.value_currency;
  let annualAud = toAnnualAud(
    record.value_total,
    currency,
    record.term_years,
    fx,
  );
  let confidence: "confirmed" | "estimated" | "undisclosed" = annualAud
    ? "confirmed"
    : "undisclosed";
  let estimateLow: number | null = null;
  let estimateHigh: number | null = null;

  if (!annualAud) {
    const comps = await comparablesFor(
      db,
      record.arena,
      record.territory,
      propertyTier,
    );
    const est = await estimate(record, comps);
    if (est?.estimate_low && est?.estimate_high) {
      estimateLow = est.estimate_low;
      estimateHigh = est.estimate_high;
      currency = est.currency ?? "AUD";
      const mid = (est.estimate_low + est.estimate_high) / 2;
      annualAud = toAnnualAud(mid, currency, 1, fx);
      confidence = "estimated";
      report.estimatesProduced++;
    } else {
      report.estimatesDeclined++;
    }
  }

  const { score, components } = scoreDeal(
    {
      valueAnnualAud: annualAud,
      valueConfidence: confidence,
      brandProfileScore: brandProfile,
      propertyTier,
      rightsType: record.rights_type,
      categoryExclusive: record.category_exclusive === true,
      announcedOn: new Date(announcedOn + "T00:00:00Z"),
      isRenewal: record.is_renewal === true,
    },
    new Date(),
    cfg,
  );

  return { currency, annualAud, confidence, estimateLow, estimateHigh, score, components };
}
