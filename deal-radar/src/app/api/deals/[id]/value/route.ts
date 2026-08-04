import { NextResponse } from "next/server";
import { DEFAULT_CONFIG, scoreDeal, toAnnualAud } from "@/lib/scoring";
import { serviceClient } from "@/lib/supabase";
import type { Currency } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  low: number | null;
  high: number | null;
  currency: Currency;
  confidence: "confirmed" | "estimated" | "undisclosed";
  reason?: string;
  appliedBy?: string;
}

// Manual value override. Recomputes the score in place and writes an audit row.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as Body;
  const db = serviceClient();

  const { data: deal } = await db
    .from("deals_ranked")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { data: fxRows } = await db
    .from("deals_fx_rates")
    .select("currency, aud_per_unit");
  const fx: Record<string, number> = { AUD: 1 };
  for (const r of fxRows ?? []) fx[r.currency] = Number(r.aud_per_unit);

  const mid =
    body.low !== null && body.high !== null ? (body.low + body.high) / 2 : null;
  const annualAud = toAnnualAud(mid, body.currency, 1, fx);

  const { data: brand } = await db
    .from("deals_brands")
    .select("profile_score")
    .eq("id", deal.brand_id)
    .maybeSingle();

  const { score, components } = scoreDeal(
    {
      valueAnnualAud: annualAud,
      valueConfidence: body.confidence,
      brandProfileScore: brand?.profile_score ?? 50,
      propertyTier: deal.property_tier ?? 3,
      rightsType: deal.rights_type,
      categoryExclusive: deal.category_exclusive,
      announcedOn: new Date(deal.announced_on + "T00:00:00Z"),
      isRenewal: deal.is_renewal,
    },
    new Date(),
    DEFAULT_CONFIG,
  );

  await db.from("deals_value_overrides").insert({
    deal_id: id,
    previous: {
      low: deal.value_estimate_low,
      high: deal.value_estimate_high,
      confidence: deal.value_confidence,
      annual_aud: deal.value_annual_aud,
      score: deal.score,
    },
    applied: { ...body, annual_aud: annualAud, score },
    reason: body.reason ?? null,
    applied_by: body.appliedBy ?? null,
  });

  const { error } = await db
    .from("deals")
    .update({
      value_estimate_low: body.low,
      value_estimate_high: body.high,
      value_currency: body.currency,
      value_confidence: body.confidence,
      value_annual_aud: annualAud,
      value_overridden: true,
      value_override_note: body.reason ?? null,
      score,
      score_components: components,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, score });
}
