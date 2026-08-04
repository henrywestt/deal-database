-- Seed data for the deals module.
-- EVERY DEAL BELOW IS INVENTED. The brands and properties are real,
-- the partnerships and figures are not. This exists only so the UI
-- renders before the pipeline is wired up. Truncate before first live run.

truncate deals_deal_articles, deals_value_overrides, deals, deals_articles, deals_properties, deals_brands, deals_sources restart identity cascade;

-- Sources
insert into deals_sources (name, feed_url, territory_bias, trust_weight) values
  ('Ministry of Sport', 'https://ministryofsport.com/feed/', 'au', 0.9),
  ('SportsPro Media', 'https://www.sportspromedia.com/feed/', 'global', 0.9),
  ('Australian Financial Review', 'https://www.afr.com/rss/companies', 'au', 0.95),
  ('AdNews', 'https://www.adnews.com.au/rss', 'au', 0.75),
  ('Mumbrella', 'https://mumbrella.com.au/feed', 'au', 0.75),
  ('NZ Herald', 'https://www.nzherald.co.nz/business/rss', 'nz', 0.8),
  ('The Register NZ', 'https://www.theregister.co.nz/feed', 'nz', 0.7),
  ('SportBusiness', 'https://www.sportbusiness.com/feed/', 'global', 0.9),
  ('Sportico', 'https://www.sportico.com/feed/', 'us', 0.85),
  ('Esports Insider', 'https://esportsinsider.com/feed', 'global', 0.8),
  ('Billboard', 'https://www.billboard.com/feed/', 'us', 0.75),
  ('Variety', 'https://variety.com/feed/', 'us', 0.75),
  ('Marketing Dive', 'https://www.marketingdive.com/feeds/news/', 'us', 0.7);

-- Brands
insert into deals_brands (name, parent_company, category, profile_score, profile_source) values
  ('Telstra', 'Telstra Group', 'Telecommunications', 88, 'manual'),
  ('ANZ', 'ANZ Group', 'Banking', 82, 'manual'),
  ('Chemist Warehouse', 'CW Group', 'Retail pharmacy', 74, 'manual'),
  ('Rebel', 'Super Retail Group', 'Sporting goods', 66, 'manual'),
  ('Bendigo Bank', 'Bendigo and Adelaide Bank', 'Banking', 58, 'manual'),
  ('ASB Bank', 'Commonwealth Bank', 'Banking', 70, 'manual'),
  ('Woolworths', 'Woolworths Group', 'Grocery', 86, 'manual'),
  ('KFC', 'Yum! Brands', 'QSR', 80, 'manual'),
  ('Suncorp', 'Suncorp Group', 'Insurance', 72, 'manual'),
  ('Air New Zealand', 'Air New Zealand', 'Airline', 74, 'manual'),
  ('Emirates', 'Emirates Group', 'Airline', 92, 'manual'),
  ('Google Pixel', 'Alphabet', 'Consumer tech', 94, 'manual'),
  ('Red Bull', 'Red Bull GmbH', 'Energy drinks', 90, 'manual'),
  ('Spotify', 'Spotify AB', 'Streaming', 88, 'manual'),
  ('Lululemon', 'Lululemon Athletica', 'Apparel', 78, 'manual'),
  ('Samsung', 'Samsung Electronics', 'Consumer tech', 93, 'manual'),
  ('Mastercard', 'Mastercard Inc', 'Payments', 89, 'manual'),
  ('Bupa', 'Bupa Group', 'Health insurance', 70, 'manual'),
  ('Optus', 'Singtel', 'Telecommunications', 80, 'manual'),
  ('Zespri', 'Zespri International', 'Food and beverage', 56, 'manual');

-- Properties
insert into deals_properties (name, arena, territory, tier, tier_source) values
  ('Australian Olympic Committee', 'sport', 'au', 1, 'manual'),
  ('New Zealand Cricket', 'sport', 'nz', 2, 'manual'),
  ('Netball Australia', 'sport', 'au', 2, 'manual'),
  ('Athletics Australia', 'sport', 'au', 3, 'manual'),
  ('Melbourne Rebels', 'sport', 'au', 3, 'manual'),
  ('Athletics New Zealand', 'sport', 'nz', 3, 'manual'),
  ('Cricket Australia', 'sport', 'au', 1, 'manual'),
  ('National Rugby League', 'sport', 'au', 1, 'manual'),
  ('Suncorp Super Netball', 'sport', 'au', 2, 'manual'),
  ('New Zealand Rugby', 'sport', 'nz', 1, 'manual'),
  ('ATP Tour', 'sport', 'global', 1, 'manual'),
  ('Formula 1', 'sport', 'global', 1, 'manual'),
  ('FIFA World Cup 2026', 'sport', 'global', 1, 'manual'),
  ('Splendour in the Grass', 'music', 'au', 2, 'manual'),
  ('Laneway Festival', 'music', 'anz', 3, 'manual'),
  ('Rising Melbourne', 'film_tv', 'au', 3, 'manual'),
  ('League of Legends EMEA', 'gaming', 'eu', 2, 'manual'),
  ('LIV Esports Oceania', 'gaming', 'anz', 4, 'manual'),
  ('Parkrun Australia', 'health_wellness', 'au', 3, 'manual'),
  ('Les Mills', 'health_wellness', 'nz', 3, 'manual'),
  ('Coachella', 'music', 'us', 1, 'manual'),
  ('Sundance Film Festival', 'film_tv', 'us', 2, 'manual');

-- Articles, one per deal, so the source link resolves
insert into deals_articles (source_id, url, headline, published_at, content_hash, state) values
  ((select id from deals_sources where name = 'Australian Financial Review'), 'https://example.com/afr-telstra-aoc', 'Telstra extends as principal partner of the Australian Olympic Team through LA28.', current_date - 0, md5('https://example.com/afr-telstra-aoc'), 'classified'),
  ((select id from deals_sources where name = 'SportBusiness'), 'https://example.com/sb-pixel-f1', 'Google Pixel becomes official smartphone partner of Formula 1 from 2027.', current_date - 0, md5('https://example.com/sb-pixel-f1'), 'classified'),
  ((select id from deals_sources where name = 'SportsPro Media'), 'https://example.com/sp-anz-nzc', 'ANZ extends principal partnership across all New Zealand Cricket formats.', current_date - 1, md5('https://example.com/sp-anz-nzc'), 'classified'),
  ((select id from deals_sources where name = 'Sportico'), 'https://example.com/sportico-mc-fifa', 'Mastercard renews as official payments partner through the 2026 tournament.', current_date - 1, md5('https://example.com/sportico-mc-fifa'), 'classified'),
  ((select id from deals_sources where name = 'Ministry of Sport'), 'https://example.com/mos-cw-netball', 'Chemist Warehouse takes front-of-dress across Suncorp Super Netball.', current_date - 1, md5('https://example.com/mos-cw-netball'), 'classified'),
  ((select id from deals_sources where name = 'Australian Financial Review'), 'https://example.com/afr-woolies-ca', 'Woolworths signs as official grocery partner across all Australian formats.', current_date - 2, md5('https://example.com/afr-woolies-ca'), 'classified'),
  ((select id from deals_sources where name = 'Ministry of Sport'), 'https://example.com/mos-rebel-aa', 'Rebel backs the junior athletics pathway as official participation partner.', current_date - 2, md5('https://example.com/mos-rebel-aa'), 'classified'),
  ((select id from deals_sources where name = 'AdNews'), 'https://example.com/adnews-kfc-nrl', 'KFC renews as major partner of the NRL and the KFC BBQ Bash.', current_date - 3, md5('https://example.com/adnews-kfc-nrl'), 'classified'),
  ((select id from deals_sources where name = 'AdNews'), 'https://example.com/adnews-bendigo-rebels', 'Bendigo Bank becomes community partner of the Melbourne Rebels for three years.', current_date - 3, md5('https://example.com/adnews-bendigo-rebels'), 'classified'),
  ((select id from deals_sources where name = 'NZ Herald'), 'https://example.com/nzh-airnz-nzr', 'Air New Zealand extends its long-running All Blacks partnership to 2030.', current_date - 4, md5('https://example.com/nzh-airnz-nzr'), 'classified'),
  ((select id from deals_sources where name = 'SportsPro Media'), 'https://example.com/sp-emirates-atp', 'Emirates renews as title partner of the ATP rankings and umpire programme.', current_date - 5, md5('https://example.com/sp-emirates-atp'), 'classified'),
  ((select id from deals_sources where name = 'The Register NZ'), 'https://example.com/register-asb-anz', 'ASB signs as principal partner of Athletics New Zealand and its events series.', current_date - 6, md5('https://example.com/register-asb-anz'), 'classified'),
  ((select id from deals_sources where name = 'Mumbrella'), 'https://example.com/mumbrella-optus-ssn', 'Optus takes official connectivity partnership across the league broadcast.', current_date - 7, md5('https://example.com/mumbrella-optus-ssn'), 'classified'),
  ((select id from deals_sources where name = 'Billboard'), 'https://example.com/billboard-spotify-coachella', 'Spotify becomes official streaming partner of Coachella with an on-site stage.', current_date - 1, md5('https://example.com/billboard-spotify-coachella'), 'classified'),
  ((select id from deals_sources where name = 'Esports Insider'), 'https://example.com/ei-redbull-lec', 'Red Bull renews across the LEC with a player performance programme.', current_date - 2, md5('https://example.com/ei-redbull-lec'), 'classified'),
  ((select id from deals_sources where name = 'Mumbrella'), 'https://example.com/mumbrella-samsung-splendour', 'Samsung takes naming rights to the amphitheatre stage at Splendour.', current_date - 3, md5('https://example.com/mumbrella-samsung-splendour'), 'classified'),
  ((select id from deals_sources where name = 'Marketing Dive'), 'https://example.com/md-lululemon-lesmills', 'Lululemon becomes apparel partner across Les Mills global instructor network.', current_date - 5, md5('https://example.com/md-lululemon-lesmills'), 'classified'),
  ((select id from deals_sources where name = 'Ministry of Sport'), 'https://example.com/mos-bupa-parkrun', 'Bupa renews as principal partner of Parkrun Australia for a further four years.', current_date - 6, md5('https://example.com/mos-bupa-parkrun'), 'classified'),
  ((select id from deals_sources where name = 'The Register NZ'), 'https://example.com/register-zespri-laneway', 'Zespri signs on as official fruit partner across Laneway ANZ dates.', current_date - 4, md5('https://example.com/register-zespri-laneway'), 'classified'),
  ((select id from deals_sources where name = 'Variety'), 'https://example.com/variety-suncorp-sundance', 'Suncorp backs the Sundance Australian filmmaker fellowship.', current_date - 8, md5('https://example.com/variety-suncorp-sundance'), 'classified');

-- Deals
insert into deals (brand_id, property_id, brand_name, property_name, arena, territory, rights_type, category_exclusive, category, headline, summary, announced_on, term_years, value_currency, value_confirmed_total, value_estimate_low, value_estimate_high, value_confidence, value_annual_aud, score, score_components, is_renewal, dedupe_key) values
  ((select id from deals_brands where name = 'Telstra'), (select id from deals_properties where name = 'Australian Olympic Committee'), 'Telstra', 'Australian Olympic Committee', 'sport', 'au', 'principal_partner', true, 'Telecommunications', 'Telstra extends as principal partner of the Australian Olympic Team through LA28.', 'Telstra extends as principal partner of the Australian Olympic Team through LA28.', current_date - 0, 4, 'AUD', 60000000, null, null, 'confirmed', 15000000, 82.83, '{"value":82.57,"brand":88,"tier":100,"exclusivity":100,"base":82.83,"decay":1,"ageDays":0,"valueSource":"actual"}'::jsonb, true, 'telstra__australian-olympic-committee__seed'),
  ((select id from deals_brands where name = 'Google Pixel'), (select id from deals_properties where name = 'Formula 1'), 'Google Pixel', 'Formula 1', 'sport', 'global', 'official_partner', true, 'Consumer tech', 'Google Pixel becomes official smartphone partner of Formula 1 from 2027.', 'Google Pixel becomes official smartphone partner of Formula 1 from 2027.', current_date - 0, 3, 'USD', null, 30000000, 70000000, 'estimated', 76500000, 89.25, '{"value":90,"brand":94,"tier":100,"exclusivity":65,"base":89.25,"decay":1,"ageDays":0,"valueSource":"actual"}'::jsonb, false, 'google-pixel__formula-1__seed'),
  ((select id from deals_brands where name = 'ANZ'), (select id from deals_properties where name = 'New Zealand Cricket'), 'ANZ', 'New Zealand Cricket', 'sport', 'nz', 'principal_partner', true, 'Banking', 'ANZ extends principal partnership across all New Zealand Cricket formats.', 'ANZ extends principal partnership across all New Zealand Cricket formats.', current_date - 1, 5, 'NZD', null, 8000000, 12000000, 'estimated', 9200000, 67.82, '{"value":67.94,"brand":82,"tier":80,"exclusivity":100,"base":72.38,"decay":0.937,"ageDays":1,"valueSource":"actual"}'::jsonb, true, 'anz__new-zealand-cricket__seed'),
  ((select id from deals_brands where name = 'Mastercard'), (select id from deals_properties where name = 'FIFA World Cup 2026'), 'Mastercard', 'FIFA World Cup 2026', 'sport', 'global', 'official_partner', true, 'Payments', 'Mastercard renews as official payments partner through the 2026 tournament.', 'Mastercard renews as official payments partner through the 2026 tournament.', current_date - 1, 1, 'USD', null, 40000000, 90000000, 'estimated', 99450000, 75.85, '{"value":90,"brand":89,"tier":100,"exclusivity":65,"base":80.96,"decay":0.937,"ageDays":1,"valueSource":"actual"}'::jsonb, true, 'mastercard__fifa-world-cup-2026__seed'),
  ((select id from deals_brands where name = 'Chemist Warehouse'), (select id from deals_properties where name = 'Netball Australia'), 'Chemist Warehouse', 'Netball Australia', 'sport', 'au', 'major_partner', true, 'Retail pharmacy', 'Chemist Warehouse takes front-of-dress across Suncorp Super Netball.', 'Chemist Warehouse takes front-of-dress across Suncorp Super Netball.', current_date - 1, 3, 'AUD', null, 3000000, 6000000, 'estimated', 4500000, 66.24, '{"value":58.63,"brand":74,"tier":80,"exclusivity":85,"base":70.7,"decay":0.937,"ageDays":1,"valueSource":"actual"}'::jsonb, false, 'chemist-warehouse__netball-australia__seed'),
  ((select id from deals_brands where name = 'Woolworths'), (select id from deals_properties where name = 'Cricket Australia'), 'Woolworths', 'Cricket Australia', 'sport', 'au', 'official_partner', true, 'Grocery', 'Woolworths signs as official grocery partner across all Australian formats.', 'Woolworths signs as official grocery partner across all Australian formats.', current_date - 2, 3, 'AUD', 21000000, null, null, 'confirmed', 7000000, 70.32, '{"value":71.54,"brand":86,"tier":100,"exclusivity":65,"base":79.87,"decay":0.88,"ageDays":2,"valueSource":"actual"}'::jsonb, false, 'woolworths__cricket-australia__seed'),
  ((select id from deals_brands where name = 'Rebel'), (select id from deals_properties where name = 'Athletics Australia'), 'Rebel', 'Athletics Australia', 'sport', 'au', 'official_partner', false, 'Sporting goods', 'Rebel backs the junior athletics pathway as official participation partner.', 'Rebel backs the junior athletics pathway as official participation partner.', current_date - 2, 3, 'AUD', null, null, null, 'undisclosed', null, 37.6, '{"value":18.64,"brand":66,"tier":60,"exclusivity":45,"base":42.71,"decay":0.88,"ageDays":2,"valueSource":"tier_fallback"}'::jsonb, false, 'rebel__athletics-australia__seed'),
  ((select id from deals_brands where name = 'KFC'), (select id from deals_properties where name = 'National Rugby League'), 'KFC', 'National Rugby League', 'sport', 'au', 'major_partner', true, 'QSR', 'KFC renews as major partner of the NRL and the KFC BBQ Bash.', 'KFC renews as major partner of the NRL and the KFC BBQ Bash.', current_date - 3, 4, 'AUD', null, 6000000, 14000000, 'estimated', 10000000, 61.36, '{"value":69.03,"brand":80,"tier":100,"exclusivity":85,"base":73.93,"decay":0.83,"ageDays":3,"valueSource":"actual"}'::jsonb, true, 'kfc__national-rugby-league__seed'),
  ((select id from deals_brands where name = 'Bendigo Bank'), (select id from deals_properties where name = 'Melbourne Rebels'), 'Bendigo Bank', 'Melbourne Rebels', 'sport', 'au', 'principal_partner', false, 'Banking', 'Bendigo Bank becomes community partner of the Melbourne Rebels for three years.', 'Bendigo Bank becomes community partner of the Melbourne Rebels for three years.', current_date - 3, 3, 'AUD', null, null, null, 'undisclosed', null, 38.76, '{"value":18.64,"brand":58,"tier":60,"exclusivity":85,"base":46.71,"decay":0.83,"ageDays":3,"valueSource":"tier_fallback"}'::jsonb, false, 'bendigo-bank__melbourne-rebels__seed'),
  ((select id from deals_brands where name = 'Air New Zealand'), (select id from deals_properties where name = 'New Zealand Rugby'), 'Air New Zealand', 'New Zealand Rugby', 'sport', 'nz', 'principal_partner', true, 'Airline', 'Air New Zealand extends its long-running All Blacks partnership to 2030.', 'Air New Zealand extends its long-running All Blacks partnership to 2030.', current_date - 4, 6, 'NZD', null, 10000000, 20000000, 'estimated', 13800000, 59.77, '{"value":73.23,"brand":74,"tier":100,"exclusivity":100,"base":76.17,"decay":0.785,"ageDays":4,"valueSource":"actual"}'::jsonb, true, 'air-new-zealand__new-zealand-rugby__seed'),
  ((select id from deals_brands where name = 'Emirates'), (select id from deals_properties where name = 'ATP Tour'), 'Emirates', 'ATP Tour', 'sport', 'global', 'naming_rights', true, 'Airline', 'Emirates renews as title partner of the ATP rankings and umpire programme.', 'Emirates renews as title partner of the ATP rankings and umpire programme.', current_date - 5, 5, 'USD', null, 15000000, 30000000, 'estimated', 34425000, 63.03, '{"value":85.14,"brand":92,"tier":100,"exclusivity":100,"base":84.69,"decay":0.744,"ageDays":5,"valueSource":"actual"}'::jsonb, true, 'emirates__atp-tour__seed'),
  ((select id from deals_brands where name = 'ASB Bank'), (select id from deals_properties where name = 'Athletics New Zealand'), 'ASB Bank', 'Athletics New Zealand', 'sport', 'nz', 'principal_partner', true, 'Banking', 'ASB signs as principal partner of Athletics New Zealand and its events series.', 'ASB signs as principal partner of Athletics New Zealand and its events series.', current_date - 6, 4, 'NZD', null, null, null, 'undisclosed', null, 36.79, '{"value":18.64,"brand":70,"tier":60,"exclusivity":100,"base":51.96,"decay":0.708,"ageDays":6,"valueSource":"tier_fallback"}'::jsonb, false, 'asb-bank__athletics-new-zealand__seed'),
  ((select id from deals_brands where name = 'Optus'), (select id from deals_properties where name = 'Suncorp Super Netball'), 'Optus', 'Suncorp Super Netball', 'sport', 'au', 'official_partner', false, 'Telecommunications', 'Optus takes official connectivity partnership across the league broadcast.', 'Optus takes official connectivity partnership across the league broadcast.', current_date - 7, 3, 'AUD', null, null, null, 'undisclosed', null, 37.36, '{"value":31.36,"brand":80,"tier":80,"exclusivity":45,"base":55.29,"decay":0.676,"ageDays":7,"valueSource":"tier_fallback"}'::jsonb, false, 'optus__suncorp-super-netball__seed'),
  ((select id from deals_brands where name = 'Spotify'), (select id from deals_properties where name = 'Coachella'), 'Spotify', 'Coachella', 'music', 'us', 'official_partner', true, 'Streaming', 'Spotify becomes official streaming partner of Coachella with an on-site stage.', 'Spotify becomes official streaming partner of Coachella with an on-site stage.', current_date - 1, 2, 'USD', null, 5000000, 12000000, 'estimated', 13005000, 75.64, '{"value":72.45,"brand":88,"tier":100,"exclusivity":65,"base":80.73,"decay":0.937,"ageDays":1,"valueSource":"actual"}'::jsonb, false, 'spotify__coachella__seed'),
  ((select id from deals_brands where name = 'Red Bull'), (select id from deals_properties where name = 'League of Legends EMEA'), 'Red Bull', 'League of Legends EMEA', 'gaming', 'eu', 'major_partner', true, 'Energy drinks', 'Red Bull renews across the LEC with a player performance programme.', 'Red Bull renews across the LEC with a player performance programme.', current_date - 2, 3, 'EUR', null, 3000000, 8000000, 'estimated', 9130000, 63.49, '{"value":67.85,"brand":90,"tier":80,"exclusivity":85,"base":72.12,"decay":0.88,"ageDays":2,"valueSource":"actual"}'::jsonb, true, 'red-bull__league-of-legends-emea__seed'),
  ((select id from deals_brands where name = 'Samsung'), (select id from deals_properties where name = 'Splendour in the Grass'), 'Samsung', 'Splendour in the Grass', 'music', 'au', 'naming_rights', true, 'Consumer tech', 'Samsung takes naming rights to the amphitheatre stage at Splendour.', 'Samsung takes naming rights to the amphitheatre stage at Splendour.', current_date - 3, 2, 'AUD', null, null, null, 'undisclosed', null, 55.43, '{"value":31.36,"brand":93,"tier":80,"exclusivity":100,"base":66.79,"decay":0.83,"ageDays":3,"valueSource":"tier_fallback"}'::jsonb, false, 'samsung__splendour-in-the-grass__seed'),
  ((select id from deals_brands where name = 'Lululemon'), (select id from deals_properties where name = 'Les Mills'), 'Lululemon', 'Les Mills', 'health_wellness', 'nz', 'official_partner', false, 'Apparel', 'Lululemon becomes apparel partner across Les Mills global instructor network.', 'Lululemon becomes apparel partner across Les Mills global instructor network.', current_date - 5, 3, 'NZD', null, null, null, 'undisclosed', null, 34.02, '{"value":18.64,"brand":78,"tier":60,"exclusivity":45,"base":45.71,"decay":0.744,"ageDays":5,"valueSource":"tier_fallback"}'::jsonb, false, 'lululemon__les-mills__seed'),
  ((select id from deals_brands where name = 'Bupa'), (select id from deals_properties where name = 'Parkrun Australia'), 'Bupa', 'Parkrun Australia', 'health_wellness', 'au', 'principal_partner', true, 'Health insurance', 'Bupa renews as principal partner of Parkrun Australia for a further four years.', 'Bupa renews as principal partner of Parkrun Australia for a further four years.', current_date - 6, 4, 'AUD', null, null, null, 'undisclosed', null, 33.84, '{"value":18.64,"brand":70,"tier":60,"exclusivity":100,"base":47.8,"decay":0.708,"ageDays":6,"valueSource":"tier_fallback"}'::jsonb, true, 'bupa__parkrun-australia__seed'),
  ((select id from deals_brands where name = 'Zespri'), (select id from deals_properties where name = 'Laneway Festival'), 'Zespri', 'Laneway Festival', 'music', 'anz', 'official_partner', false, 'Food and beverage', 'Zespri signs on as official fruit partner across Laneway ANZ dates.', 'Zespri signs on as official fruit partner across Laneway ANZ dates.', current_date - 4, 2, 'NZD', null, null, null, 'undisclosed', null, 31.55, '{"value":18.64,"brand":56,"tier":60,"exclusivity":45,"base":40.21,"decay":0.785,"ageDays":4,"valueSource":"tier_fallback"}'::jsonb, false, 'zespri__laneway-festival__seed'),
  ((select id from deals_brands where name = 'Suncorp'), (select id from deals_properties where name = 'Sundance Film Festival'), 'Suncorp', 'Sundance Film Festival', 'film_tv', 'us', 'official_partner', false, 'Insurance', 'Suncorp backs the Sundance Australian filmmaker fellowship.', 'Suncorp backs the Sundance Australian filmmaker fellowship.', current_date - 8, 2, 'USD', null, null, null, 'undisclosed', null, 34.46, '{"value":31.36,"brand":72,"tier":80,"exclusivity":45,"base":53.29,"decay":0.647,"ageDays":8,"valueSource":"tier_fallback"}'::jsonb, false, 'suncorp__sundance-film-festival__seed');

-- Link each deal to its primary article
insert into deals_deal_articles (deal_id, article_id, is_primary)
select d.id, a.id, true
from deals d
join deals_articles a on a.headline = d.headline;
