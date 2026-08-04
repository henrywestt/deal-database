const API_URL = "https://api.anthropic.com/v1/messages";

interface CallOptions {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}

// Returns parsed JSON, or null if the model returned something unusable.
// Null is handled everywhere upstream. A failed parse should skip the
// article, never crash the run.
export async function callJson<T>(opts: CallOptions): Promise<T | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1500,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    });
  } catch (err) {
    console.error("anthropic request failed", err);
    return null;
  }

  if (!res.ok) {
    console.error("anthropic error", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const text: string = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");

  return parseJson<T>(text);
}

// Models occasionally wrap JSON in fences despite instruction. Strip them,
// then take the outermost object if there is leading prose.
export function parseJson<T>(text: string): T | null {
  let cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  cleaned = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.error("json parse failed", cleaned.slice(0, 300));
    return null;
  }
}
