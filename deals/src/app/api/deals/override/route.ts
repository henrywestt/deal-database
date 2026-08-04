import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { scoreDeal, DEFAULT_CONFIG, toAnnualAud } from "@/lib/scoring";

export const dynamic = "force-dynamic";

interface Body {
  deal_id: string;
  value_total?: number | null;
  currency?: string | null;
  term_years?: number | null;
  confidence?: "confirmed" | "estimated" | "undisclosed";
  reason?: string;
  applied_by?: string;
}

export async function POST(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.headers.get("x-admin-token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body.deal_id) {
    return NextResponse.json({ error: "deal_id required" }, { status: 400 });
  }

  const db = serviceClient();

  const { data: deal } = await db.from("deals").select("*").eq("id", body.deal_id).single();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: fxRows } = await db.from("deals_fx_rates").select("currency, aud_per_unit");
  const fx: Record<string, number> = { AUD: 1 };
  for (const row of fxRows ?? []) fx[row.currency] = Number(row.aud_per_unit);

  const currency = body.currency ?? deal.value_currency ?? "AUD";
  const termYears = body.term_years ?? deal.term_years ?? 1;
  const annualAud =
    body.value_total === null || body.value_total === undefined
      ? null
      : toAnnualAud(body.value_total, currency, termYears, fx);

  const confidence = body.confidence ?? (annualAud ? "confirmed" : "undisclosed");

  const { data: brand } = await db
    .from("deals_brands")
    .select("profile_score")
    .eq("id", deal.brand_id)
    .maybeSingle();
  const { data: property } = await db
    .from("deals_properties")
    .select("tier")
    .eq("id", deal.property_id)
    .maybeSingle();

  const { score, components } = scoreDeal(
    {
      valueAnnualAud: annualAud,
      valueConfidence: confidence,
      brandProfileScore: brand ? Number(brand.profile_score) : 50,
      propertyTier: property ? Number(property.tier) : 3,
      rightsType: deal.rights_type,
      categoryExclusive: deal.category_exclusive,
      announcedOn: new Date(deal.announced_on),
      isRenewal: deal.is_renewal,
    },
    new Date(),
    DEFAULT_CONFIG,
  );

  await db.from("deals_value_overrides").insert({
    deal_id: deal.id,
    previous: {
      value_confirmed_total: deal.value_confirmed_total,
      value_estimate_low: deal.value_estimate_low,
      value_estimate_high: deal.value_estimate_high,
      value_annual_aud: deal.value_annual_aud,
      value_confidence: deal.value_confidence,
      score: deal.score,
    },
    applied: { value_total: body.value_total, currency, term_years: termYears, confidence, score },
    reason: body.reason ?? null,
    applied_by: body.applied_by ?? "api",
  });

  await db
    .from("deals")
    .update({
      value_confirmed_total: confidence === "confirmed" ? body.value_total : null,
      value_estimate_low: null,
      value_estimate_high: null,
      value_currency: currency,
      value_annual_aud: annualAud,
      value_confidence: confidence,
      value_overridden: true,
      value_override_note: body.reason ?? null,
      term_years: termYears,
      score,
      score_components: components,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deal.id);

  return NextResponse.json({ ok: true, score });
}
