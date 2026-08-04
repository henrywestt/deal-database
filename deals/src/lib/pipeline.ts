import Parser from "rss-parser";
import { serviceClient } from "./supabase";
import { callJson } from "./claude";
import { CLASSIFY_SYSTEM, EXTRACT_SYSTEM, ESTIMATE_SYSTEM } from "./prompts";
import { scoreDeal, toAnnualAud, DEFAULT_CONFIG, ScoreConfig } from "./scoring";
import type {
  ClassifyResult,
  ExtractResult,
  EstimateResult,
  Currency,
  ValueConfidence,
} from "./types";

const parser = new Parser({ timeout: 15000 });

export interface RunReport {
  sourcesPolled: number;
  articlesInserted: number;
  articlesProcessed: number;
  rejected: number;
  dealsCreated: number;
  dealsMerged: number;
  estimatesProduced: number;
  estimatesDeclined: number;
  rescored: number;
  errors: string[];
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function dedupeKey(brand: string, property: string, announcedOn: string): string {
  return `${slug(brand)}__${slug(property)}__${announcedOn.slice(0, 7)}`;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h >>> 0);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// RSS summaries are often too thin to extract terms from. Try the page,
// but never let a slow publisher hold up the run.
async function fetchArticleText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; DealsBot/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    return text.length > 400 ? text.slice(0, 12000) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Step 1: poll sources into deals_articles
// ---------------------------------------------------------------

async function pollSources(report: RunReport): Promise<void> {
  const db = serviceClient();
  const lookbackDays = Number(env("LOOKBACK_DAYS", "3"));
  const cutoff = Date.now() - lookbackDays * 86400000;

  const { data: sources, error } = await db
    .from("deals_sources")
    .select("id, name, feed_url")
    .eq("active", true);

  if (error || !sources) {
    report.errors.push(`source fetch failed: ${error?.message}`);
    return;
  }

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.feed_url);
      report.sourcesPolled++;

      const rows = (feed.items ?? [])
        .filter((item) => {
          if (!item.link || !item.title) return false;
          const ts = item.isoDate ? Date.parse(item.isoDate) : Date.now();
          return ts >= cutoff;
        })
        .map((item) => {
          const body = stripHtml(
            item["content:encoded"] ?? item.content ?? item.contentSnippet ?? "",
          );
          return {
            source_id: source.id,
            url: item.link!,
            headline: item.title!.slice(0, 500),
            published_at: item.isoDate ?? new Date().toISOString(),
            body_text: body || null,
            content_hash: hash(item.title! + (item.link ?? "")),
            state: "pending" as const,
          };
        });

      if (rows.length === 0) continue;

      const { data: inserted } = await db
        .from("deals_articles")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
        .select("id");

      report.articlesInserted += inserted?.length ?? 0;

      await db
        .from("deals_sources")
        .update({ last_polled_at: new Date().toISOString(), last_error: null })
        .eq("id", source.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.errors.push(`${source.name}: ${message}`);
      await db
        .from("deals_sources")
        .update({ last_polled_at: new Date().toISOString(), last_error: message })
        .eq("id", source.id);
    }
  }
}

// ---------------------------------------------------------------
// Step 2: classify, extract, estimate, score
// ---------------------------------------------------------------

async function loadConfig(): Promise<ScoreConfig> {
  const db = serviceClient();
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

async function loadFx(): Promise<Record<string, number>> {
  const db = serviceClient();
  const { data } = await db.from("deals_fx_rates").select("currency, aud_per_unit");
  const map: Record<string, number> = { AUD: 1 };
  for (const row of data ?? []) map[row.currency] = Number(row.aud_per_unit);
  return map;
}

async function upsertBrand(x: ExtractResult): Promise<string | null> {
  const db = serviceClient();
  const { data: existing } = await db
    .from("deals_brands")
    .select("id")
    .eq("name", x.brand_name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data } = await db
    .from("deals_brands")
    .insert({
      name: x.brand_name,
      parent_company: x.brand_parent,
      category: x.brand_category,
      profile_score: x.brand_profile_score ?? 50,
      profile_source: x.brand_profile_score === null ? "default" : "model",
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function upsertProperty(x: ExtractResult): Promise<string | null> {
  const db = serviceClient();
  const { data: existing } = await db
    .from("deals_properties")
    .select("id")
    .eq("name", x.property_name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data } = await db
    .from("deals_properties")
    .insert({
      name: x.property_name,
      arena: x.arena,
      territory: x.territory,
      tier: x.property_tier ?? 3,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function getBrandScore(brandId: string | null, fallback: number | null): Promise<number> {
  if (!brandId) return fallback ?? 50;
  const db = serviceClient();
  const { data } = await db
    .from("deals_brands")
    .select("profile_score")
    .eq("id", brandId)
    .single();
  return data ? Number(data.profile_score) : fallback ?? 50;
}

async function getPropertyTier(propertyId: string | null, fallback: number | null): Promise<number> {
  if (!propertyId) return fallback ?? 3;
  const db = serviceClient();
  const { data } = await db
    .from("deals_properties")
    .select("tier")
    .eq("id", propertyId)
    .single();
  return data ? Number(data.tier) : fallback ?? 3;
}

async function comparables(x: ExtractResult, tier: number): Promise<string> {
  const db = serviceClient();
  const { data } = await db
    .from("deals")
    .select("brand_name, property_name, rights_type, value_annual_aud, announced_on")
    .eq("arena", x.arena)
    .eq("territory", x.territory)
    .eq("value_confidence", "confirmed")
    .not("value_annual_aud", "is", null)
    .order("announced_on", { ascending: false })
    .limit(8);

  if (!data || data.length === 0) return "No comparables available.";
  return data
    .map(
      (d) =>
        `${d.brand_name} x ${d.property_name}, ${d.rights_type}, ` +
        `A$${Number(d.value_annual_aud).toLocaleString()} per year, ${d.announced_on}`,
    )
    .join("\n") + `\n\nTarget property tier: ${tier}`;
}

async function processArticle(
  article: { id: string; headline: string; body_text: string | null; url: string; published_at: string | null },
  cfg: ScoreConfig,
  fx: Record<string, number>,
  report: RunReport,
): Promise<void> {
  const db = serviceClient();

  let body = article.body_text ?? "";
  if (body.length < 600) {
    const fetched = await fetchArticleText(article.url);
    if (fetched) body = fetched;
  }

  const userBlock =
    `Headline: ${article.headline}\n` +
    `Published: ${article.published_at ?? "unknown"}\n\n` +
    body.slice(0, 6000);

  // Call 1
  const classified = await callJson<ClassifyResult>({
    model: env("MODEL_CLASSIFY", "claude-haiku-4-5-20251001"),
    system: CLASSIFY_SYSTEM,
    user: userBlock.slice(0, 2500),
    maxTokens: 300,
  });

  if (!classified) {
    await db.from("deals_articles").update({ state: "failed" }).eq("id", article.id);
    return;
  }

  if (!classified.qualifies) {
    report.rejected++;
    await db
      .from("deals_articles")
      .update({
        state: "rejected",
        reject_reason: classified.reason,
        processed_at: new Date().toISOString(),
      })
      .eq("id", article.id);
    return;
  }

  // Call 2
  const x = await callJson<ExtractResult>({
    model: env("MODEL_EXTRACT", "claude-sonnet-5"),
    system: EXTRACT_SYSTEM,
    user: userBlock,
    maxTokens: 1200,
  });

  if (!x || !x.brand_name || !x.property_name || !x.announced_on) {
    await db.from("deals_articles").update({ state: "failed" }).eq("id", article.id);
    return;
  }

  const key = dedupeKey(x.brand_name, x.property_name, x.announced_on);

  const { data: existingDeal } = await db
    .from("deals")
    .select("id")
    .eq("dedupe_key", key)
    .maybeSingle();

  if (existingDeal) {
    await db
      .from("deals_deal_articles")
      .upsert(
        { deal_id: existingDeal.id, article_id: article.id, is_primary: false },
        { onConflict: "deal_id,article_id", ignoreDuplicates: true },
      );
    await db
      .from("deals_articles")
      .update({
        state: "merged",
        extraction_raw: x as unknown as Record<string, unknown>,
        processed_at: new Date().toISOString(),
      })
      .eq("id", article.id);
    report.dealsMerged++;
    return;
  }

  const brandId = await upsertBrand(x);
  const propertyId = await upsertProperty(x);
  const brandScore = await getBrandScore(brandId, x.brand_profile_score);
  const tier = await getPropertyTier(propertyId, x.property_tier);

  // Value resolution
  let currency: Currency | null = x.value_currency;
  let confidence: ValueConfidence = "undisclosed";
  let confirmedTotal: number | null = null;
  let estLow: number | null = null;
  let estHigh: number | null = null;
  let annualAud: number | null = null;
  let estimateRaw: EstimateResult | null = null;

  if (x.value_total && x.value_total > 0) {
    confirmedTotal = x.value_total;
    confidence = "confirmed";
    annualAud = toAnnualAud(x.value_total, currency, x.term_years, fx);
  } else {
    // Call 3
    estimateRaw = await callJson<EstimateResult>({
      model: env("MODEL_ESTIMATE", "claude-sonnet-5"),
      system: ESTIMATE_SYSTEM,
      user:
        `Deal to estimate:\n${JSON.stringify(x, null, 2)}\n\n` +
        `Comparable deals with known values:\n${await comparables(x, tier)}`,
      maxTokens: 800,
    });

    if (estimateRaw?.estimate_low && estimateRaw?.estimate_high) {
      estLow = estimateRaw.estimate_low;
      estHigh = estimateRaw.estimate_high;
      currency = estimateRaw.currency ?? "AUD";
      confidence = "estimated";
      const midpoint = (estLow + estHigh) / 2;
      annualAud = toAnnualAud(midpoint, currency, 1, fx);
      report.estimatesProduced++;
    } else {
      report.estimatesDeclined++;
    }
  }

  const { score, components } = scoreDeal(
    {
      valueAnnualAud: annualAud,
      valueConfidence: confidence,
      brandProfileScore: brandScore,
      propertyTier: tier,
      rightsType: x.rights_type,
      categoryExclusive: x.category_exclusive === true,
      announcedOn: new Date(x.announced_on),
      isRenewal: x.is_renewal,
    },
    new Date(),
    cfg,
  );

  const { data: deal, error: dealError } = await db
    .from("deals")
    .insert({
      brand_id: brandId,
      property_id: propertyId,
      brand_name: x.brand_name,
      property_name: x.property_name,
      arena: x.arena,
      territory: x.territory,
      rights_type: x.rights_type,
      category_exclusive: x.category_exclusive === true,
      category: x.category,
      headline: article.headline,
      summary: x.summary,
      announced_on: x.announced_on,
      term_start: x.term_start,
      term_end: x.term_end,
      term_years: x.term_years,
      value_currency: currency,
      value_confirmed_total: confirmedTotal,
      value_estimate_low: estLow,
      value_estimate_high: estHigh,
      value_confidence: confidence,
      value_annual_aud: annualAud,
      score,
      score_components: components,
      is_renewal: x.is_renewal,
      dedupe_key: key,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    report.errors.push(`deal insert failed: ${dealError?.message}`);
    await db.from("deals_articles").update({ state: "failed" }).eq("id", article.id);
    return;
  }

  await db
    .from("deals_deal_articles")
    .insert({ deal_id: deal.id, article_id: article.id, is_primary: true });

  await db
    .from("deals_articles")
    .update({
      state: "classified",
      extraction_raw: { extract: x, estimate: estimateRaw } as unknown as Record<string, unknown>,
      processed_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  report.dealsCreated++;
}

// ---------------------------------------------------------------
// Step 3: rescore. Decay means yesterday's scores are stale.
// ---------------------------------------------------------------

async function rescoreRecent(cfg: ScoreConfig, report: RunReport): Promise<void> {
  const db = serviceClient();
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);

  const { data: rows } = await db
    .from("deals")
    .select(
      "id, value_annual_aud, value_confidence, rights_type, category_exclusive, announced_on, is_renewal, brand_id, property_id",
    )
    .gte("announced_on", since);

  if (!rows) return;

  for (const row of rows) {
    const brandScore = await getBrandScore(row.brand_id, 50);
    const tier = await getPropertyTier(row.property_id, 3);
    const { score, components } = scoreDeal(
      {
        valueAnnualAud: row.value_annual_aud === null ? null : Number(row.value_annual_aud),
        valueConfidence: row.value_confidence,
        brandProfileScore: brandScore,
        propertyTier: tier,
        rightsType: row.rights_type,
        categoryExclusive: row.category_exclusive,
        announcedOn: new Date(row.announced_on),
        isRenewal: row.is_renewal,
      },
      new Date(),
      cfg,
    );
    await db
      .from("deals")
      .update({ score, score_components: components, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    report.rescored++;
  }
}

// ---------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------

export async function runPipeline(): Promise<RunReport> {
  const report: RunReport = {
    sourcesPolled: 0,
    articlesInserted: 0,
    articlesProcessed: 0,
    rejected: 0,
    dealsCreated: 0,
    dealsMerged: 0,
    estimatesProduced: 0,
    estimatesDeclined: 0,
    rescored: 0,
    errors: [],
  };

  const db = serviceClient();
  const cfg = await loadConfig();
  const fx = await loadFx();

  await pollSources(report);

  const limit = Number(env("MAX_ARTICLES_PER_RUN", "40"));
  const { data: pending } = await db
    .from("deals_articles")
    .select("id, headline, body_text, url, published_at")
    .eq("state", "pending")
    .order("ingested_at", { ascending: true })
    .limit(limit);

  for (const article of pending ?? []) {
    try {
      await processArticle(article, cfg, fx, report);
    } catch (err) {
      report.errors.push(
        `article ${article.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await db.from("deals_articles").update({ state: "failed" }).eq("id", article.id);
    }
    report.articlesProcessed++;
  }

  await rescoreRecent(cfg, report);

  return report;
}
