import type {
  Currency,
  RightsType,
  ScoreComponents,
  ValueConfidence,
} from "./types";

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

export interface DealScoreInput {
  valueAnnualAud: number | null;
  valueConfidence: ValueConfidence;
  brandProfileScore: number;
  propertyTier: number;
  rightsType: RightsType;
  categoryExclusive: boolean;
  announcedOn: Date;
  isRenewal: boolean;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

// Tier implies a rough annual value when nothing is disclosed. Deliberately
// conservative: an undisclosed tier 1 should not outrank a confirmed mid-size
// deal on the value axis alone.
const TIER_FALLBACK_AUD: Record<number, number> = {
  1: 2_000_000,
  2: 750_000,
  3: 250_000,
  4: 80_000,
  5: 50_000,
};

const TIER_SCORE: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20 };

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

// Log scale. Linear would compress everything under A$5m into one band,
// which is most of the ANZ market.
function scoreValue(annualAud: number, cfg: ScoreConfig): number {
  if (annualAud <= cfg.valueFloorAud) return 0;
  if (annualAud >= cfg.valueCeilingAud) return 100;
  const span = Math.log10(cfg.valueCeilingAud / cfg.valueFloorAud);
  return clamp((Math.log10(annualAud / cfg.valueFloorAud) / span) * 100);
}

// Exponential decay with a floor, so old deals sink but never vanish.
// Default half life of 9 days: day 0 = 1.00, day 7 = 0.68, day 30 = 0.43.
export function recencyMultiplier(ageDays: number, cfg: ScoreConfig): number {
  const decayed =
    cfg.decayFloor +
    (1 - cfg.decayFloor) *
      Math.exp(-Math.max(0, ageDays) / cfg.decayHalfLifeDays);
  return Math.min(1, decayed);
}

export function scoreDeal(
  input: DealScoreInput,
  now: Date = new Date(),
  cfg: ScoreConfig = DEFAULT_CONFIG,
): { score: number; components: ScoreComponents } {
  const tier = Math.min(5, Math.max(1, Math.round(input.propertyTier || 3)));

  let annual = input.valueAnnualAud;
  let valueSource: "actual" | "tier_fallback" = "actual";
  if (annual === null || annual <= 0) {
    annual = TIER_FALLBACK_AUD[tier];
    valueSource = "tier_fallback";
  }

  let value = scoreValue(annual, cfg);
  if (input.valueConfidence === "estimated") value *= cfg.estimatePenalty;
  if (valueSource === "tier_fallback") value *= 0.8;

  const brand = clamp(input.brandProfileScore);
  const tierScore = TIER_SCORE[tier];
  const exclusivity = clamp(
    (RIGHTS_SCORE[input.rightsType] ?? 30) + (input.categoryExclusive ? 20 : 0),
  );

  let base =
    value * cfg.weightValue +
    brand * cfg.weightBrand +
    tierScore * cfg.weightTier +
    exclusivity * cfg.weightExclusivity;

  // A renewal is less newsworthy than a new entrant, but it still tells you
  // the category is taken.
  if (input.isRenewal) base *= 0.92;

  const ageDays =
    (now.getTime() - input.announcedOn.getTime()) / (1000 * 60 * 60 * 24);
  const decay = recencyMultiplier(ageDays, cfg);

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    score: round(clamp(base * decay)),
    components: {
      value: round(value),
      brand: round(brand),
      tier: tierScore,
      exclusivity: round(exclusivity),
      base: round(base),
      decay: Math.round(decay * 1000) / 1000,
      ageDays: Math.round(ageDays * 10) / 10,
      valueSource,
    },
  };
}

export function toAnnualAud(
  totalValue: number | null,
  currency: Currency | null,
  termYears: number | null,
  fx: Record<string, number>,
): number | null {
  if (totalValue === null || totalValue <= 0) return null;
  const rate = fx[(currency ?? "AUD").toUpperCase()];
  if (!rate) return null;
  const years = termYears && termYears > 0 ? termYears : 1;
  return Math.round((totalValue * rate) / years);
}
