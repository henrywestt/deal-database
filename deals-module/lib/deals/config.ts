import { serviceClient } from "./supabase";
import { DEFAULT_CONFIG, type ScoreConfig } from "./scoring";

// Weights live in the database so they can be retuned without a deploy.
// Cached for the life of the process, which is fine for a daily job.
let cachedConfig: ScoreConfig | null = null;
let cachedFx: Record<string, number> | null = null;

export async function loadScoreConfig(): Promise<ScoreConfig> {
  if (cachedConfig) return cachedConfig;

  const { data, error } = await serviceClient()
    .from("deals_score_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.warn("Falling back to default score config:", error?.message);
    return DEFAULT_CONFIG;
  }

  cachedConfig = {
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

  return cachedConfig;
}

export async function loadFxRates(): Promise<Record<string, number>> {
  if (cachedFx) return cachedFx;

  const { data, error } = await serviceClient()
    .from("deals_fx_rates")
    .select("currency, aud_per_unit");

  if (error || !data) {
    console.warn("Falling back to hardcoded FX:", error?.message);
    return { AUD: 1, NZD: 0.92, USD: 1.53, GBP: 1.95, EUR: 1.66 };
  }

  cachedFx = Object.fromEntries(
    data.map((r) => [r.currency, Number(r.aud_per_unit)]),
  );
  return cachedFx;
}

export function clearConfigCache() {
  cachedConfig = null;
  cachedFx = null;
}
