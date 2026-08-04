-- Seed the source registry. Verify each feed resolves before you rely on it;
-- publishers move and kill RSS endpoints regularly. Anything that fails can be
-- deactivated with a single update, and the job logs the error against the row.

insert into deals_sources (name, feed_url, homepage_url, territory_bias, arena_bias, trust_weight) values
  ('SportsPro Media',           'https://www.sportspromedia.com/feed/',            'https://www.sportspromedia.com',         'global', 'sport',   0.90),
  ('Ministry of Sport',         'https://ministryofsport.com/feed/',               'https://ministryofsport.com',            'au',     'sport',   0.90),
  ('AdNews',                    'https://www.adnews.com.au/feed',                  'https://www.adnews.com.au',              'au',     null,      0.75),
  ('Mumbrella',                 'https://mumbrella.com.au/feed',                   'https://mumbrella.com.au',               'au',     null,      0.75),
  ('B and T',                   'https://www.bandt.com.au/feed/',                  'https://www.bandt.com.au',               'au',     null,      0.70),
  ('Front Office Sports',       'https://frontofficesports.com/feed/',             'https://frontofficesports.com',          'us',     'sport',   0.75),
  ('Sportico',                  'https://www.sportico.com/feed/',                  'https://www.sportico.com',               'us',     'sport',   0.85),
  ('iSportConnect',             'https://www.isportconnect.com/feed/',             'https://www.isportconnect.com',          'global', 'sport',   0.65),
  ('Esports Insider',           'https://esportsinsider.com/feed',                 'https://esportsinsider.com',             'global', 'gaming',  0.80),
  ('Music Business Worldwide',  'https://www.musicbusinessworldwide.com/feed/',    'https://www.musicbusinessworldwide.com', 'global', 'music',   0.80),
  ('Variety Business',          'https://variety.com/v/biz/feed/',                 'https://variety.com',                    'us',     'film_tv', 0.75),
  ('Marketing Dive',            'https://www.marketingdive.com/feeds/news/',       'https://www.marketingdive.com',          'us',     null,      0.70)
on conflict (feed_url) do nothing;

-- Property tiers. The scorer reads these, so correcting them is the highest
-- leverage manual edit available. Anything unlisted defaults to tier 3.

insert into deals_properties (name, arena, territory, tier, tier_source) values
  ('Australian Olympic Committee',   'sport', 'au', 1, 'manual'),
  ('Australian Football League',     'sport', 'au', 1, 'manual'),
  ('National Rugby League',          'sport', 'au', 1, 'manual'),
  ('Cricket Australia',              'sport', 'au', 1, 'manual'),
  ('Tennis Australia',               'sport', 'au', 1, 'manual'),
  ('New Zealand Rugby',              'sport', 'nz', 1, 'manual'),
  ('Rugby Australia',                'sport', 'au', 2, 'manual'),
  ('Football Australia',             'sport', 'au', 2, 'manual'),
  ('Netball Australia',              'sport', 'au', 2, 'manual'),
  ('Supercars',                      'sport', 'au', 2, 'manual'),
  ('New Zealand Cricket',            'sport', 'nz', 2, 'manual'),
  ('New Zealand Olympic Committee',  'sport', 'nz', 2, 'manual'),
  ('Athletics Australia',            'sport', 'au', 3, 'manual'),
  ('Athletics New Zealand',          'sport', 'nz', 3, 'manual'),
  ('Swimming Australia',             'sport', 'au', 3, 'manual'),
  ('Basketball Australia',           'sport', 'au', 3, 'manual')
on conflict (name) do nothing;

-- Brand profile scores. Default is 50. Raising the majors is what stops an
-- unknown brand outranking Telstra on an otherwise identical deal.

insert into deals_brands (name, category, profile_score, profile_source) values
  ('Telstra',           'Telecommunications', 90, 'manual'),
  ('Commonwealth Bank', 'Banking',            90, 'manual'),
  ('ANZ',               'Banking',            88, 'manual'),
  ('NAB',               'Banking',            85, 'manual'),
  ('Westpac',           'Banking',            85, 'manual'),
  ('ASB Bank',          'Banking',            75, 'manual'),
  ('Woolworths',        'Grocery',            88, 'manual'),
  ('Coles',             'Grocery',            86, 'manual'),
  ('Qantas',            'Airline',            88, 'manual'),
  ('Air New Zealand',   'Airline',            78, 'manual'),
  ('Toyota',            'Automotive',         88, 'manual'),
  ('Nike',              'Sportswear',         95, 'manual'),
  ('adidas',            'Sportswear',         92, 'manual'),
  ('Chemist Warehouse', 'Retail pharmacy',    72, 'manual'),
  ('Rebel',             'Sporting goods',     65, 'manual'),
  ('Bendigo Bank',      'Banking',            58, 'manual')
on conflict (name) do nothing;
