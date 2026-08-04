import Anthropic from "@anthropic-ai/sdk";
import type {
  ClassifierResult,
  EstimatorResult,
  ExtractorResult,
} from "./types";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const EXTRACTOR_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    client = new Anthropic({ apiKey });
  }
  return client;
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

function parseJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const CLASSIFIER_SYSTEM = `You classify news articles. Return only JSON, no preamble, no markdown fences.

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

const EXTRACTOR_SYSTEM = `You extract structured records from sponsorship announcements. Return only JSON, no preamble, no markdown fences.

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

const ESTIMATOR_SYSTEM = `You estimate the annual value of a sponsorship deal. Return only JSON, no preamble, no markdown fences.

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

export async function classify(article: {
  headline: string;
  publishedAt: string | null;
  sourceName: string;
  bodyText: string;
}): Promise<ClassifierResult | null> {
  const res = await anthropic().messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 300,
    system: CLASSIFIER_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Headline: ${article.headline}
Published: ${article.publishedAt ?? "unknown"}
Source: ${article.sourceName}

${article.bodyText.slice(0, 2000)}`,
      },
    ],
  });
  return parseJson<ClassifierResult>(textOf(res));
}

export async function extract(article: {
  headline: string;
  publishedAt: string | null;
  sourceName: string;
  bodyText: string;
}): Promise<ExtractorResult | null> {
  const res = await anthropic().messages.create({
    model: EXTRACTOR_MODEL,
    max_tokens: 1200,
    system: EXTRACTOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Headline: ${article.headline}
Published: ${article.publishedAt ?? "unknown"}
Source: ${article.sourceName}

${article.bodyText.slice(0, 8000)}`,
      },
    ],
  });
  return parseJson<ExtractorResult>(textOf(res));
}

export async function estimate(
  deal: ExtractorResult,
  comparables: string[],
): Promise<EstimatorResult | null> {
  if (comparables.length < 2) return null;

  const res = await anthropic().messages.create({
    model: EXTRACTOR_MODEL,
    max_tokens: 700,
    system: ESTIMATOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Deal to estimate:
${JSON.stringify(deal, null, 2)}

Comparable deals with known values:
${comparables.join("\n")}`,
      },
    ],
  });
  return parseJson<EstimatorResult>(textOf(res));
}
