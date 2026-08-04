import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/deals/supabase";
import { loadFxRates, loadScoreConfig } from "@/lib/deals/config";
import { scoreDeal, toAnnualAud } from "@/lib/deals/scoring";

export const dynamic = "force-dynamic";

// Manual value correction. Writes an audit row, then rescores the deal.
export async function POST(req: Request) {
  const body = await req.json();
  const {
    dealId,
    valueTotal,
    currency,
    termYears,
    confidence,
    reason,
    appliedBy,
  } = body ?? {};

  if (!dealId || !confidence) {
    return NextResponse.json(
      { error: "dealId and confidence are required" },
      { status: 400 },
    );
  }

  const db = serviceClient();
  const cfg = await loadScoreConfig();
  const fx = await loadFxRates();

  const { data: deal, error } = await db
    .from("deals_ranked")
    .select("*")
    .eq("id", dealId)
    .single();

  if (error || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { data: brand } = await db
    .from("deals_brands")
    .select("profile_score")
    .eq("id", deal.brand_id)
    .maybeSingle();

  const annualAud =
    confidence === "undisclosed"
      ? null
      : toAnnualAud(valueTotal, currency ?? "AUD", termYears ?? deal.term_years, fx);

  const result = scoreDeal(
    {
      valueAnnualAud: annualAud,
      valueConfidence: confidence,
      brandProfileScore: brand?.profile_score ?? 50,
      propertyTier: deal.property_tier ?? 3,
      rightsType: deal.rights_type,
      categoryExclusive: deal.category_exclusive,
      announcedOn: new Date(deal.announced_on),
      isRenewal: deal.is_renewal,
    },
    new Date(),
    cfg,
  );

  await db.from("deals_value_overrides").insert({
    deal_id: dealId,
    previous: {
      value_confirmed_total: deal.value_confirmed_total,
      value_estimate_low: deal.value_estimate_low,
      value_estimate_high: deal.value_estimate_high,
      value_confidence: deal.value_confidence,
      value_annual_aud: deal.value_annual_aud,
      score: deal.score,
    },
    applied: {
      value_confirmed_total: valueTotal ?? null,
      value_currency: currency ?? "AUD",
      value_confidence: confidence,
      value_annual_aud: annualAud,
      score: result.score,
    },
    reason: reason ?? null,
    applied_by: appliedBy ?? null,
  });

  const { error: updateErr } = await db
    .from("deals")
    .update({
      value_confirmed_total: confidence === "confirmed" ? valueTotal : null,
      value_estimate_low: confidence === "estimated" ? valueTotal : null,
      value_estimate_high: confidence === "estimated" ? valueTotal : null,
      value_currency: currency ?? "AUD",
      value_confidence: confidence,
      value_annual_aud: annualAud,
      value_overridden: true,
      value_override_note: reason ?? null,
      score: result.score,
      score_components: result.components,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, score: result.score });
}
