import Anthropic from "@anthropic-ai/sdk";
import type {
  Classification,
  Deal,
  Estimate,
  ExtractedDeal,
} from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHEAP_MODEL = "claude-haiku-4-5-20251001";
const MAIN_MODEL = "claude-sonnet-4-6";

function parseJson<T>(raw: string, label: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?/gm, "")
    .replace(/```$/gm, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.error(`Could not parse ${label} response:`, raw.slice(0, 400));
    return null;
  }
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ---------------------------------------------------------------
// Call 1: classifier
// ---------------------------------------------------------------

const CLASSIFY_SYSTEM = `You classify news articles. Return only JSON, no preamble, no markdown fences.

An article qualifies if it announces, renews, extends, or ends a commercial sponsorship or partnership between a brand and a rights holder, property, event, team, athlete, artist, studio, publisher, or festival.

It does not qualify if it is:
- speculation, rumour, or a report that talks are underway
- a broadcast or media rights deal with no brand sponsor involved
- a supplier or vendor contract with no marketing rights
- a merger, acquisition, investment, or funding round
- a general marketing campaign with no partnership at its centre
- a listicle, opinion piece, or roundup covering multiple deals loosely

Return:
{
  "qualifies": boolean,
  "arena": "sport" | "music" | "film_tv" | "gaming" | "health_wellness" | null,
  "reason": string
}`;

export async function classify(article: {
  headline: string;
  published_at: string | null;
  source_name: string;
  body_text: string | null;
}): Promise<Classification | null> {
  const res = await anthropic.messages.create({
    model: CHEAP_MODEL,
    max_tokens: 300,
    system: CLASSIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Headline: ${article.headline}`,
          `Published: ${article.published_at ?? "unknown"}`,
          `Source: ${article.source_name}`,
          "",
          (article.body_text ?? "").slice(0, 2000),
        ].join("\n"),
      },
    ],
  });

  return parseJson<Classification>(textOf(res), "classification");
}

// ---------------------------------------------------------------
// Call 2: extractor
// ---------------------------------------------------------------

const EXTRACT_SYSTEM = `You extract structured records from sponsorship announcements. Return only JSON, no preamble, no markdown fences.

Rules:
- Use null for any field the article does not state. Never infer, never estimate, never fill a gap with a plausible value. A null is correct.
- brand is the paying party. property is the rights holder.
- summary is one sentence under 20 words describing what the brand gets. Write it in active voice. Do not editorialise.
- value_total is the headline figure only if the article states one, or quotes a party or named outlet stating one. A figure described as "believed to be" or "understood to be" is not confirmed. Return it in value_reported_unconfirmed instead.
- is_renewal is true if the article describes an extension, renewal, or continuation of an existing relationship.

Return:
{
  "brand_name": string,
  "brand_parent": string | null,
  "brand_category": string | null,
  "property_name": string,
  "arena": "sport" | "music" | "film_tv" | "gaming" | "health_wellness",
  "territory": "au" | "nz" | "anz" | "uk" | "us" | "eu" | "apac" | "global" | "other",
  "rights_type": "naming_rights" | "principal_partner" | "major_partner" | "official_partner" | "supplier" | "media_rights" | "athlete_endorsement" | "kit_apparel" | "other",
  "category_exclusive": boolean | null,
  "category": string | null,
  "summary": string,
  "announced_on": "YYYY-MM-DD",
  "term_start": "YYYY-MM-DD" | null,
  "term_end": "YYYY-MM-DD" | null,
  "term_years": number | null,
  "value_total": number | null,
  "value_currency": "AUD" | "NZD" | "USD" | "GBP" | "EUR" | null,
  "value_reported_unconfirmed": number | null,
  "is_renewal": boolean
}`;

export async function extract(article: {
  headline: string;
  published_at: string | null;
  source_name: string;
  body_text: string | null;
}): Promise<ExtractedDeal | null> {
  const res = await anthropic.messages.create({
    model: MAIN_MODEL,
    max_tokens: 1200,
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Headline: ${article.headline}`,
          `Published: ${article.published_at ?? "unknown"}`,
          `Source: ${article.source_name}`,
          "",
          (article.body_text ?? "").slice(0, 8000),
        ].join("\n"),
      },
    ],
  });

  return parseJson<ExtractedDeal>(textOf(res), "extraction");
}

// ---------------------------------------------------------------
// Call 3: estimator
// ---------------------------------------------------------------

const ESTIMATE_SYSTEM = `You estimate the annual value of a sponsorship deal. Return only JSON, no preamble, no markdown fences.

You will be given a deal record and a set of comparable deals with known values. Estimate only where the comparables genuinely support a range.

Return null for the band if any of these are true:
- fewer than two relevant comparables are supplied
- the property tier or category is unclear
- the deal is a community, regional, or in-kind arrangement where cash value is not the point

Returning null is the correct answer more often than not. Do not produce a band to appear useful. A wrong number is worse than no number because it will be ranked as if it were real.

Where you do estimate, the band must be wide enough to be honest. A band narrower than 2x low to high implies a precision you do not have.

confidence is "low" unless three or more close comparables support the range.

Return:
{
  "estimate_low": number | null,
  "estimate_high": number | null,
  "currency": "AUD" | "NZD" | "USD" | "GBP" | "EUR" | null,
  "basis": "per_year",
  "confidence": "low" | "medium" | "high" | null,
  "comparables_used": string[],
  "reasoning": string
}`;

export async function estimate(
  deal: ExtractedDeal,
  comparables: Pick<
    Deal,
    | "brand_name"
    | "property_name"
    | "property_tier"
    | "rights_type"
    | "value_annual_aud"
    | "announced_on"
  >[],
): Promise<Estimate | null> {
  if (comparables.length < 2) return null;

  const compTable = comparables
    .map(
      (c) =>
        `${c.brand_name} x ${c.property_name} | tier ${c.property_tier ?? "?"} | ${c.rights_type} | A$${c.value_annual_aud?.toLocaleString() ?? "?"} per year | ${c.announced_on}`,
    )
    .join("\n");

  const res = await anthropic.messages.create({
    model: MAIN_MODEL,
    max_tokens: 800,
    system: ESTIMATE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          "Deal to estimate:",
          JSON.stringify(deal, null, 2),
          "",
          "Comparable deals with known values:",
          compTable,
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJson<Estimate>(textOf(res), "estimate");
  if (!parsed) return null;

  // Guard against the model ignoring its own instruction on band width.
  if (parsed.estimate_low && parsed.estimate_high) {
    if (parsed.estimate_high < parsed.estimate_low * 1.5) {
      parsed.estimate_high = Math.round(parsed.estimate_low * 2);
    }
  }

  return parsed;
}
