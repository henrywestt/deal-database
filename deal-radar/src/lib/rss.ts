import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  url: string;
  headline: string;
  publishedAt: string | null;
  summary: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function textFrom(node: unknown): string {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "#text" in node) {
    return String((node as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

export async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const res = await fetch(feedUrl, {
    headers: { "user-agent": "deal-radar/0.1 (+internal research tool)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Feed returned ${res.status}`);

  const xml = await res.text();
  const doc = parser.parse(xml) as Record<string, unknown>;
  const pick = (o: unknown, k: string): unknown =>
    o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;
  const items: FeedItem[] = [];

  // RSS 2.0
  const rssItems = asArray<Record<string, unknown>>(
    pick(pick(pick(doc, "rss"), "channel"), "item") as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  );
  for (const it of rssItems) {
    const link = textFrom(it.link);
    if (!link) continue;
    items.push({
      url: link.trim(),
      headline: stripTags(textFrom(it.title)),
      publishedAt: toIso(textFrom(it.pubDate)),
      summary: stripTags(
        textFrom(it.description) || textFrom(it["content:encoded"]),
      ),
    });
  }

  // Atom
  const atomEntries = asArray<Record<string, unknown>>(
    pick(pick(doc, "feed"), "entry") as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  );
  for (const it of atomEntries) {
    const linkNode = asArray<Record<string, unknown>>(
      it.link as Record<string, unknown>,
    )[0];
    const link =
      (linkNode?.["@_href"] as string | undefined) ?? textFrom(it.link);
    if (!link) continue;
    items.push({
      url: String(link).trim(),
      headline: stripTags(textFrom(it.title)),
      publishedAt: toIso(textFrom(it.updated) || textFrom(it.published)),
      summary: stripTags(textFrom(it.summary) || textFrom(it.content)),
    });
  }

  return items;
}

// Best-effort body fetch. Paywalled pages return their teaser, which is
// usually enough for the classifier and often enough for extraction.
export async function fetchArticleBody(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "deal-radar/0.1 (+internal research tool)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
    return stripTags(body).slice(0, 12_000);
  } catch {
    return "";
  }
}

export function hashContent(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}
