import crypto from "node:crypto";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { serviceClient } from "./supabase";
import { loadFxRates, loadScoreConfig } from "./config";
import { classify, estimate, extract } from "./llm";
import { scoreDeal, toAnnualAud } from "./scoring";
import type { Arena, ExtractedDeal, Territory } from "./types";

export interface SourceItem {
  url: string;
  headline: string;
  published_at: string | null;
  body_text: string | null;
}

export interface IngestReport {
  polled: number;
  newArticles: number;
  classified: number;
  rejected: number;
  merged: number;
  dealsCreated: number;
  estimated: number;
  failed: number;
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
) {
  return `${slug(brand)}__${slug(property)}__${announcedOn.slice(0, 7)}`;
}

const hash = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

const USER_AGENT = "DealsModuleBot/1.0 (+internal deals ingest)";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SCRAPE_LINKS = 25;

const rssParser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": USER_AGENT },
});

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = cheerio.load(html).text().replace(/\s+/g, " ").trim();
  return text || null;
}

async function fetchRssItems(source: {
  feed_url: string;
}): Promise<SourceItem[]> {
  const feed = await rssParser.parseURL(source.feed_url);

  return (feed.items ?? [])
    .filter((item): item is typeof item & { link: string } => !!item.link)
    .map((item) => ({
      url: item.link,
      headline: (item.title ?? "").trim(),
      published_at: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null),
      body_text: stripHtml(
        (item as { "content:encoded"?: string })["content:encoded"] ??
          item.content ??
          item.contentSnippet ??
          null,
      ),
    }))
    .filter((item) => item.headline.length > 0);
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function fetchArticleText(url: string): Promise<string | null> {
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    $("script, style, nav, header, footer").remove();
    const container = $("article").length ? $("article") : $("main").length ? $("main") : $("body");
    return stripHtml(container.html() ?? "");
  } catch {
    return null;
  }
}

async function fetchScrapedItems(source: {
  feed_url: string;
  homepage_url?: string | null;
}): Promise<SourceItem[]> {
  const base = source.homepage_url ?? source.feed_url;
  const html = await fetchPage(source.feed_url);
  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const links: { url: string; headline: string }[] = [];

  $("article a[href], h1 a[href], h2 a[href], h3 a[href]").each((_, el) => {
    if (links.length >= MAX_SCRAPE_LINKS) return;
    const href = $(el).attr("href");
    const headline = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || headline.length < 8) return;

    let url: string;
    try {
      url = new URL(href, base).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ url, headline });
  });

  const items: SourceItem[] = [];
  for (const link of links) {
    items.push({
      url: link.url,
      headline: link.headline,
      published_at: null,
      body_text: await fetchArticleText(link.url),
    });
  }
  return items;
}

export async function fetchSourceItems(source: {
  id: string;
  name: string;
  feed_url: string;
  homepage_url?: string | null;
  method: string;
}): Promise<SourceItem[]> {
  if (source.method === "scrape") return fetchScrapedItems(source);
  return fetchRssItems(source);
}

export async function runIngest(): Promise<IngestReport> {
  const db = serviceClient();
  const cfg = await loadScoreConfig();
  const fx = await loadFxRates();

  const report: IngestReport = {
    polled: 0,
    newArticles: 0,
    classified: 0,
    rejected: 0,
    merged: 0,
    dealsCreated: 0,
    estimated: 0,
    failed: 0,
  };

  const { data: sources } = await db
    .from("deals_sources")
    .select("*")
    .eq("active", true);

  for (const source of sources ?? []) {
    report.polled++;

    let items: SourceItem[] = [];
    try {
      items = await fetchSourceItems(source);
    } catch (err) {
      await db
        .from("deals_sources")
        .update({
          last_polled_at: new Date().toISOString(),
          last_error: String(err),
        })
        .eq("id", source.id);
      continue;
    }

    for (const item of items) {
      const contentHash = hash(item.url + item.headline);

      const { data: article, error: insertErr } = await db
        .from("deals_articles")
        .insert({
          source_id: source.id,
          url: item.url,
          headline: item.headline,
          published_at: item.published_at,
          body_text: item.body_text,
          content_hash: contentHash,
        })
        .select()
        .single();

      // Unique violation means we have seen this URL already.
      if (insertErr || !article) continue;
      report.newArticles++;

      try {
        const cls = await classify({
          headline: item.headline,
          published_at: item.published_at,
          source_name: source.name,
          body_text: item.body_text,
        });

        if (!cls?.qualifies) {
          report.rejected++;
          await db
            .from("deals_articles")
            .update({
              state: "rejected",
              reject_reason: cls?.reason ?? "classifier returned nothing",
              processed_at: new Date().toISOString(),
            })
            .eq("id", article.id);
          continue;
        }

        report.classified++;

        const ex = await extract({
          headline: item.headline,
          published_at: item.published_at,
          source_name: source.name,
          body_text: item.body_text,
        });

        if (!ex) {
          report.failed++;
          await db
            .from("deals_articles")
            .update({ state: "failed", processed_at: new Date().toISOString() })
            .eq("id", article.id);
          continue;
        }

        const key = dedupeKey(ex.brand_name, ex.property_name, ex.announced_on);

        // Already have this deal. Attach the article and move on.
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
              extraction_raw: ex as never,
              processed_at: new Date().toISOString(),
            })
            .eq("id", article.id);
          report.merged++;
          continue;
        }

        const dealId = await createDeal(ex, key, cfg, fx, report);

        await db.from("deals_deal_articles").insert({
          deal_id: dealId,
          article_id: article.id,
          is_primary: true,
        });

        await db
          .from("deals_articles")
          .update({
            state: "classified",
            extraction_raw: ex as never,
            processed_at: new Date().toISOString(),
          })
          .eq("id", article.id);

        report.dealsCreated++;
      } catch (err) {
        report.failed++;
        await db
          .from("deals_articles")
          .update({
            state: "failed",
            reject_reason: String(err),
            processed_at: new Date().toISOString(),
          })
          .eq("id", article.id);
      }
    }

    await db
      .from("deals_sources")
      .update({ last_polled_at: new Date().toISOString(), last_error: null })
      .eq("id", source.id);
  }

  return report;
}

async function createDeal(
  ex: ExtractedDeal,
  key: string,
  cfg: Awaited<ReturnType<typeof loadScoreConfig>>,
  fx: Record<string, number>,
  report: IngestReport,
): Promise<string> {
  const db = serviceClient();

  const brand = await upsertBrand(ex);
  const property = await upsertProperty(ex);

  let confidence: "confirmed" | "estimated" | "undisclosed" = "undisclosed";
  let annualAud: number | null = null;
  let estLow: number | null = null;
  let estHigh: number | null = null;
  let currency = ex.value_currency;

  if (ex.value_total) {
    confidence = "confirmed";
    annualAud = toAnnualAud(ex.value_total, currency, ex.term_years, fx);
  } else {
    // No disclosed figure. Pull comparables and try the estimator.
    const { data: comps } = await db
      .from("deals_ranked")
      .select(
        "brand_name, property_name, property_tier, rights_type, value_annual_aud, announced_on",
      )
      .eq("arena", ex.arena)
      .eq("territory", ex.territory)
      .not("value_annual_aud", "is", null)
      .order("announced_on", { ascending: false })
      .limit(8);

      const est = await estimate(ex, comps ?? []);

    if (est?.estimate_low && est.estimate_high) {
      confidence = "estimated";
      currency = est.currency ?? currency ?? "AUD";
      estLow = est.estimate_low;
      estHigh = est.estimate_high;
      const mid = (est.estimate_low + est.estimate_high) / 2;
      annualAud = toAnnualAud(mid, currency, 1, fx);
      report.estimated++;
    }
  }

  const result = scoreDeal(
    {
      valueAnnualAud: annualAud,
      valueConfidence: confidence,
      brandProfileScore: brand.profile_score,
      propertyTier: property.tier,
      rightsType: ex.rights_type,
      categoryExclusive: ex.category_exclusive === true,
      announcedOn: new Date(ex.announced_on),
      isRenewal: ex.is_renewal,
    },
    new Date(),
    cfg,
  );

  const { data, error } = await db
    .from("deals")
    .insert({
      brand_id: brand.id,
      property_id: property.id,
      brand_name: ex.brand_name,
      property_name: ex.property_name,
      arena: ex.arena,
      territory: ex.territory,
      rights_type: ex.rights_type,
      category_exclusive: ex.category_exclusive === true,
      category: ex.category,
      headline: ex.summary,
      summary: ex.summary,
      announced_on: ex.announced_on,
      term_start: ex.term_start,
      term_end: ex.term_end,
      term_years: ex.term_years,
      value_currency: currency,
      value_confirmed_total: ex.value_total,
      value_estimate_low: estLow,
      value_estimate_high: estHigh,
      value_confidence: confidence,
      value_annual_aud: annualAud,
      score: result.score,
      score_components: result.components,
      is_renewal: ex.is_renewal,
      dedupe_key: key,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Deal insert failed: ${error?.message}`);
  return data.id;
}

async function upsertBrand(ex: ExtractedDeal) {
  const db = serviceClient();
  const { data: found } = await db
    .from("deals_brands")
    .select("*")
    .eq("name", ex.brand_name)
    .maybeSingle();
  if (found) return found;

  const { data } = await db
    .from("deals_brands")
    .insert({
      name: ex.brand_name,
      parent_company: ex.brand_parent,
      category: ex.brand_category,
      profile_score: 50,
      profile_source: "default",
    })
    .select("*")
    .single();
  return data!;
}

async function upsertProperty(ex: ExtractedDeal) {
  const db = serviceClient();
  const { data: found } = await db
    .from("deals_properties")
    .select("*")
    .eq("name", ex.property_name)
    .maybeSingle();
  if (found) return found;

  const { data } = await db
    .from("deals_properties")
    .insert({
      name: ex.property_name,
      arena: ex.arena as Arena,
      territory: ex.territory as Territory,
      tier: 3,
      tier_source: "model",
    })
    .select("*")
    .single();
  return data!;
}

// Recompute the whole archive after a weight change.
export async function rescoreAll() {
  const db = serviceClient();
  const cfg = await loadScoreConfig();

  const { data: deals } = await db
    .from("deals_ranked")
    .select("id, value_annual_aud, value_confidence, property_tier, rights_type, category_exclusive, announced_on, is_renewal, brand_id");

  for (const d of deals ?? []) {
    const { data: brand } = await db
      .from("deals_brands")
      .select("profile_score")
      .eq("id", d.brand_id)
      .maybeSingle();

    const result = scoreDeal(
      {
        valueAnnualAud: d.value_annual_aud,
        valueConfidence: d.value_confidence,
        brandProfileScore: brand?.profile_score ?? 50,
        propertyTier: d.property_tier ?? 3,
        rightsType: d.rights_type,
        categoryExclusive: d.category_exclusive,
        announcedOn: new Date(d.announced_on),
        isRenewal: d.is_renewal,
      },
      new Date(),
      cfg,
    );

    await db
      .from("deals")
      .update({ score: result.score, score_components: result.components })
      .eq("id", d.id);
  }
}
