export type Arena = "sport" | "music" | "film_tv" | "gaming" | "health_wellness";

export type Territory =
  | "au"
  | "nz"
  | "anz"
  | "uk"
  | "us"
  | "eu"
  | "apac"
  | "global"
  | "other";

export type RightsType =
  | "naming_rights"
  | "principal_partner"
  | "major_partner"
  | "official_partner"
  | "supplier"
  | "media_rights"
  | "athlete_endorsement"
  | "kit_apparel"
  | "other";

export type ValueConfidence = "confirmed" | "estimated" | "undisclosed";

export type Currency = "AUD" | "NZD" | "USD" | "GBP" | "EUR";

export const ANZ_TERRITORIES: Territory[] = ["au", "nz", "anz"];

export const ARENA_LABELS: Record<Arena, string> = {
  sport: "Sport",
  music: "Music",
  film_tv: "Film and TV",
  gaming: "Gaming",
  health_wellness: "Health and wellness",
};

export const RIGHTS_LABELS: Record<RightsType, string> = {
  naming_rights: "Naming rights",
  principal_partner: "Principal partner",
  major_partner: "Major partner",
  official_partner: "Official partner",
  supplier: "Supplier",
  media_rights: "Media rights",
  athlete_endorsement: "Athlete endorsement",
  kit_apparel: "Kit and apparel",
  other: "Partnership",
};

export interface ScoreComponents {
  value: number;
  brand: number;
  tier: number;
  exclusivity: number;
  base: number;
  decay: number;
  ageDays: number;
  valueSource: "actual" | "tier_fallback";
}

export interface DealRow {
  id: string;
  brand_name: string;
  property_name: string;
  arena: Arena;
  territory: Territory;
  rights_type: RightsType;
  category_exclusive: boolean;
  category: string | null;
  headline: string;
  summary: string | null;
  announced_on: string;
  term_years: number | null;
  value_currency: Currency | null;
  value_confirmed_total: number | null;
  value_estimate_low: number | null;
  value_estimate_high: number | null;
  value_confidence: ValueConfidence;
  value_annual_aud: number | null;
  value_overridden: boolean;
  score: number;
  score_components: ScoreComponents;
  is_renewal: boolean;
  property_tier: number | null;
  source_name: string | null;
  source_url: string | null;
}

export interface ClassifierResult {
  qualifies: boolean;
  arena: Arena | null;
  reason: string;
}

export interface ExtractorResult {
  brand_name: string;
  brand_parent: string | null;
  brand_category: string | null;
  property_name: string;
  arena: Arena;
  territory: Territory;
  rights_type: RightsType;
  category_exclusive: boolean | null;
  category: string | null;
  summary: string;
  announced_on: string;
  term_start: string | null;
  term_end: string | null;
  term_years: number | null;
  value_total: number | null;
  value_currency: Currency | null;
  value_reported_unconfirmed: number | null;
  is_renewal: boolean;
}

export interface EstimatorResult {
  estimate_low: number | null;
  estimate_high: number | null;
  currency: Currency | null;
  basis: "per_year";
  confidence: "low" | "medium" | "high" | null;
  comparables_used: string[];
  reasoning: string;
}
