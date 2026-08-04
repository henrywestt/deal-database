// Deterministic deal scoring. No LLM calls in here.
// Pure function so you can unit test it and recompute the whole archive
// after a weight change.

import type { ValueConfidence, RightsType } from "./types";

export interface ScoreConfig {
  weightValue: number;
  weightBrand: number;
  weightTier: number;
  weightExclusivity: number;
  decayFloor: number;
  decayHalfLifeDays: number;
  valueFloorAud: number;
  valueCeilingAud: number;
  estimatePenalty: number;
}

export const DEFAULT_CONFIG: ScoreConfig = {
  weightValue: 0.4,
  weightBrand: 0.25,
  weightTier: 0.2,
  weightExclusivity: 0.15,
  decayFloor: 0.4,
  decayHalfLifeDays: 9,
  valueFloorAud: 50_000,
  valueCeilingAud: 50_000_000,
  estimatePenalty: 0.9,
};

export interface DealInput {
  valueAnnualAud: number | null;
  valueConfidence: ValueConfidence;
  brandProfileScore: number; // 0 to 100
  propertyTier: number; // 1 to 5
  rightsType: RightsType;
  categoryExclusive: boolean;
  announcedOn: Date;
  isRenewal: boolean;
}

export interface ScoreResult {
  score: number;
  components: {
    value: number;
    brand: number;
    tier: number;
    exclusivity: number;
    base: number;
    decay: number;
    ageDays: number;
    valueSource: "actual" | "tier_fallback";
  };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

// Tier implies a rough annual value when nothing is disclosed.
// Deliberately conservative. An undisclosed tier 1 should not outrank a
// confirmed mid-size deal on the value axis alone.
const TIER_FALLBACK_AUD: Record<number, number> = {
  1: 2_000_000,
  2: 750_000,
  3: 250_000,
  4: 80_000,
  5: 50_000,
};

const TIER_SCORE: Record<number, number> = {
  1: 100,
  2: 80,
  3: 60,
  4: 40,
  5: 20,
};

const RIGHTS_SCORE: Record<RightsType, number> = {
  naming_rights: 100,
  principal_partner: 85,
  media_rights: 80,
  major_partner: 65,
  kit_apparel: 60,
  official_partner: 45,
  athlete_endorsement: 40,
  supplier: 25,
  other: 30,
};

// Log scale. A 50k deal scores 0, a 50m deal scores 100.
// Linear scaling would push everything below 5m into a single band.
function scoreValue(annualAud: number, cfg: ScoreConfig): number {
  const floor = cfg.valueFloorAud;
  const ceiling = cfg.valueCeilingAud;
  if (annualAud <= floor) return 0;
  if (annualAud >= ceiling) return 100;
  const span = Math.log10(ceiling / floor);
  return clamp((Math.log10(annualAud / floor) / span) * 100);
}

function scoreExclusivity(input: DealInput): number {
  const base = RIGHTS_SCORE[input.rightsType] ?? 30;
  const bonus = input.categoryExclusive ? 20 : 0;
  return clamp(base + bonus);
}

// Exponential decay with a floor, so old deals sink but never vanish.
// At the default 9 day half life: day 0 = 1.00, day 7 = 0.68,
// day 14 = 0.54, day 30 = 0.43.
function recencyMultiplier(ageDays: number, cfg: ScoreConfig): number {
  const decayed =
    cfg.decayFloor +
    (1 - cfg.decayFloor) * Math.exp(-Math.max(0, ageDays) / cfg.decayHalfLifeDays);
  return Math.min(1, decayed);
}

export function scoreDeal(
  input: DealInput,
  now: Date = new Date(),
  cfg: ScoreConfig = DEFAULT_CONFIG,
): ScoreResult {
  const tier = Math.min(5, Math.max(1, Math.round(input.propertyTier)));

  let annual = input.valueAnnualAud;
  let valueSource: "actual" | "tier_fallback" = "actual";
  if (annual === null || annual <= 0) {
    annual = TIER_FALLBACK_AUD[tier];
    valueSource = "tier_fallback";
  }

  let value = scoreValue(annual, cfg);

  // An estimate is worth slightly less than a confirmed figure of the same
  // size. An undisclosed deal riding a tier fallback takes a bigger haircut.
  if (input.valueConfidence === "estimated") value *= cfg.estimatePenalty;
  if (valueSource === "tier_fallback") value *= 0.8;

  const brand = clamp(input.brandProfileScore);
  const tierScore = TIER_SCORE[tier];
  const exclusivity = scoreExclusivity(input);

  let base =
    value * cfg.weightValue +
    brand * cfg.weightBrand +
    tierScore * cfg.weightTier +
    exclusivity * cfg.weightExclusivity;

  // A renewal is genuinely less newsworthy than a new entrant in the
  // category, but it still tells you the category is taken.
  if (input.isRenewal) base *= 0.92;

  const ageDays =
    (now.getTime() - input.announcedOn.getTime()) / (1000 * 60 * 60 * 24);
  const decay = recencyMultiplier(ageDays, cfg);

  return {
    score: Math.round(clamp(base * decay) * 100) / 100,
    components: {
      value: Math.round(value * 100) / 100,
      brand: Math.round(brand * 100) / 100,
      tier: tierScore,
      exclusivity: Math.round(exclusivity * 100) / 100,
      base: Math.round(base * 100) / 100,
      decay: Math.round(decay * 1000) / 1000,
      ageDays: Math.round(ageDays * 10) / 10,
      valueSource,
    },
  };
}

// Normalise any stated value to an annual AUD figure before scoring.
export function toAnnualAud(
  totalValue: number | null,
  currency: string | null,
  termYears: number | null,
  fxAudPerUnit: Record<string, number>,
): number | null {
  if (totalValue === null || totalValue <= 0) return null;
  const rate = fxAudPerUnit[(currency ?? "AUD").toUpperCase()];
  if (!rate) return null;
  const years = termYears && termYears > 0 ? termYears : 1;
  return Math.round((totalValue * rate) / years);
}
