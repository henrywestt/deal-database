-- Deals module schema
-- Self-contained. Prefix everything with deals_ so it lifts out cleanly later.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------

create type deals_territory as enum (
  'au', 'nz', 'anz', 'uk', 'us', 'eu', 'apac', 'global', 'other'
);

create type deals_arena as enum (
  'sport', 'music', 'film_tv', 'gaming', 'health_wellness'
);

create type deals_rights_type as enum (
  'naming_rights',
  'principal_partner',
  'major_partner',
  'official_partner',
  'supplier',
  'media_rights',
  'athlete_endorsement',
  'kit_apparel',
  'other'
);

create type deals_value_confidence as enum (
  'confirmed',    -- figure stated by a party or credible outlet
  'estimated',    -- model-inferred band
  'undisclosed'   -- no figure, tier label only
);

create type deals_article_state as enum (
  'pending', 'classified', 'rejected', 'merged', 'failed'
);

-- ---------------------------------------------------------------
-- Sources: feed registry, editable without a deploy
-- ---------------------------------------------------------------

create table deals_sources (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  feed_url text not null unique,
  homepage_url text,
  method text not null default 'rss',        -- rss | scrape
  territory_bias deals_territory not null default 'global',
  arena_bias deals_arena,
  trust_weight numeric(3,2) not null default 1.00,  -- 0.00 to 1.00
  active boolean not null default true,
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Articles: raw ingest, one row per URL
-- ---------------------------------------------------------------

create table deals_articles (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid not null references deals_sources(id) on delete cascade,
  url text not null unique,
  headline text not null,
  published_at timestamptz,
  body_text text,
  content_hash text not null,
  state deals_article_state not null default 'pending',
  reject_reason text,
  extraction_raw jsonb,
  ingested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on deals_articles (state, ingested_at desc);
create index on deals_articles (content_hash);

-- ---------------------------------------------------------------
-- Brands: profile scores live here so they are reusable and tunable
-- ---------------------------------------------------------------

create table deals_brands (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  parent_company text,
  category text,                                   -- banking, telco, QSR, etc
  profile_score smallint not null default 50,      -- 0 to 100, drives ranking
  profile_source text not null default 'default',  -- default | model | manual
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Properties: rights holders, tiered
-- ---------------------------------------------------------------

create table deals_properties (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  arena deals_arena not null,
  territory deals_territory not null,
  tier smallint not null default 3,   -- 1 highest, 5 lowest
  tier_source text not null default 'model',
  notes text,
  created_at timestamptz not null default now()
);

comment on column deals_properties.tier is
  '1 = global or national marquee (IOC, AFL, NRL, All Blacks). '
  '2 = national governing body or top-flight league. '
  '3 = club, state body or mid-tier event. '
  '4 = regional or community. '
  '5 = niche or emerging.';

-- ---------------------------------------------------------------
-- Deals: the record
-- ---------------------------------------------------------------

create table deals (
  id uuid primary key default uuid_generate_v4(),

  brand_id uuid references deals_brands(id),
  property_id uuid references deals_properties(id),
  brand_name text not null,
  property_name text not null,

  arena deals_arena not null,
  territory deals_territory not null,
  rights_type deals_rights_type not null default 'other',
  category_exclusive boolean not null default false,
  category text,

  headline text not null,
  summary text,                       -- one line, model written

  announced_on date not null,
  term_start date,
  term_end date,
  term_years numeric(4,1),

  value_currency char(3),
  value_confirmed_total numeric(14,0),
  value_estimate_low numeric(14,0),
  value_estimate_high numeric(14,0),
  value_confidence deals_value_confidence not null default 'undisclosed',
  value_annual_aud numeric(14,0),     -- normalised, drives scoring
  value_overridden boolean not null default false,
  value_override_note text,

  score numeric(5,2) not null default 0,
  score_components jsonb not null default '{}'::jsonb,

  is_renewal boolean not null default false,
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index deals_dedupe_uidx on deals (dedupe_key);
create index on deals (arena, territory, score desc);
create index on deals (announced_on desc);
create index on deals (brand_name);
create index on deals (property_name);

-- ---------------------------------------------------------------
-- Deal to article link: one deal, many write-ups
-- ---------------------------------------------------------------

create table deals_deal_articles (
  deal_id uuid not null references deals(id) on delete cascade,
  article_id uuid not null references deals_articles(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (deal_id, article_id)
);

create unique index deals_one_primary_uidx
  on deals_deal_articles (deal_id) where is_primary;

-- ---------------------------------------------------------------
-- Value override audit
-- ---------------------------------------------------------------

create table deals_value_overrides (
  id uuid primary key default uuid_generate_v4(),
  deal_id uuid not null references deals(id) on delete cascade,
  previous jsonb not null,
  applied jsonb not null,
  reason text,
  applied_by text,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Scoring config: weights live in the database so retuning is a row edit
-- ---------------------------------------------------------------

create table deals_score_config (
  id smallint primary key default 1,
  weight_value numeric(4,3) not null default 0.40,
  weight_brand numeric(4,3) not null default 0.25,
  weight_tier numeric(4,3) not null default 0.20,
  weight_exclusivity numeric(4,3) not null default 0.15,
  decay_floor numeric(4,3) not null default 0.40,
  decay_half_life_days numeric(5,2) not null default 9.00,
  value_floor_aud numeric(14,0) not null default 50000,
  value_ceiling_aud numeric(14,0) not null default 50000000,
  estimate_penalty numeric(4,3) not null default 0.90,
  updated_at timestamptz not null default now(),
  constraint one_row check (id = 1)
);

insert into deals_score_config (id) values (1);

-- ---------------------------------------------------------------
-- FX: annual AUD normalisation needs rates
-- ---------------------------------------------------------------

create table deals_fx_rates (
  currency char(3) primary key,
  aud_per_unit numeric(10,5) not null,
  updated_at timestamptz not null default now()
);

insert into deals_fx_rates (currency, aud_per_unit) values
  ('AUD', 1.00000),
  ('NZD', 0.92000),
  ('USD', 1.53000),
  ('GBP', 1.95000),
  ('EUR', 1.66000);

-- ---------------------------------------------------------------
-- Read view for the UI
-- ---------------------------------------------------------------

create view deals_ranked as
select
  d.*,
  s.name as source_name,
  a.url  as source_url,
  p.tier as property_tier
from deals d
left join deals_deal_articles da on da.deal_id = d.id and da.is_primary
left join deals_articles a on a.id = da.article_id
left join deals_sources s on s.id = a.source_id
left join deals_properties p on p.id = d.property_id;

-- ---------------------------------------------------------------
-- Row level security: read open to authenticated, writes service role only
-- ---------------------------------------------------------------

alter table deals enable row level security;
alter table deals_articles enable row level security;
alter table deals_brands enable row level security;
alter table deals_properties enable row level security;

create policy deals_read on deals
  for select to authenticated using (true);

create policy deals_brands_read on deals_brands
  for select to authenticated using (true);

create policy deals_properties_read on deals_properties
  for select to authenticated using (true);
