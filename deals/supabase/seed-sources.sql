-- Seed sources.
--
-- VERIFY EVERY FEED URL BEFORE YOU TRUST IT. These follow standard
-- WordPress and publisher conventions, but publishers move and kill RSS
-- endpoints without notice. Run the pipeline once and check
-- deals_sources.last_error, then deactivate anything that failed.
--
-- Deactivate a bad feed:
--   update deals_sources set active = false where feed_url = '...';

insert into deals_sources (name, feed_url, homepage_url, territory_bias, arena_bias, trust_weight) values

-- ANZ sport and sponsorship
('Ministry of Sport',    'https://ministryofsport.com/feed/',              'https://ministryofsport.com',    'au',     'sport', 0.90),
('AdNews',               'https://www.adnews.com.au/rss',                  'https://www.adnews.com.au',      'au',     null,    0.75),
('Mumbrella',            'https://mumbrella.com.au/feed',                  'https://mumbrella.com.au',       'au',     null,    0.75),
('B&T',                  'https://www.bandt.com.au/feed/',                 'https://www.bandt.com.au',       'au',     null,    0.70),
('The Register NZ',      'https://www.theregister.co.nz/rss.xml',          'https://www.theregister.co.nz',  'nz',     null,    0.70),

-- Global sport business
('SportsPro Media',      'https://www.sportspromedia.com/feed/',           'https://www.sportspromedia.com', 'global', 'sport', 0.90),
('Sportico',             'https://www.sportico.com/feed/',                 'https://www.sportico.com',       'us',     'sport', 0.85),
('Front Office Sports',  'https://frontofficesports.com/feed/',            'https://frontofficesports.com',  'us',     'sport', 0.75),
('iSportConnect',        'https://www.isportconnect.com/feed/',            'https://www.isportconnect.com',  'global', 'sport', 0.65),

-- Culture
('Esports Insider',      'https://esportsinsider.com/feed',                'https://esportsinsider.com',     'global', 'gaming',  0.80),
('Music Business Worldwide', 'https://www.musicbusinessworldwide.com/feed/', 'https://www.musicbusinessworldwide.com', 'global', 'music', 0.80),
('Variety',              'https://variety.com/feed/',                      'https://variety.com',            'us',     'film_tv', 0.75),
('Marketing Dive',       'https://www.marketingdive.com/feeds/news/',      'https://www.marketingdive.com',  'us',     null,      0.70)

on conflict (feed_url) do nothing;


-- Property newsrooms. Most do not publish RSS, so these are placeholders
-- for scrape-mode sources. Add them once you have a scraper, or leave
-- inactive. They are where quiet renewals surface.
--
-- AFL, NRL, Cricket Australia, Tennis Australia, Netball Australia,
-- Football Australia, Athletics Australia, Australian Olympic Committee,
-- Supercars, NZ Rugby, NZ Cricket, NZ Olympic Committee, Basketball
-- Australia, Rugby Australia, Swimming Australia.


-- Optional: seed a few known property tiers so early scoring is not all
-- model guesswork. Add your own as you go.
insert into deals_properties (name, arena, territory, tier, tier_source) values
  ('Australian Football League', 'sport', 'au', 1, 'manual'),
  ('National Rugby League',      'sport', 'au', 1, 'manual'),
  ('Cricket Australia',          'sport', 'au', 1, 'manual'),
  ('Tennis Australia',           'sport', 'au', 1, 'manual'),
  ('Australian Olympic Committee','sport','au', 1, 'manual'),
  ('New Zealand Rugby',          'sport', 'nz', 1, 'manual'),
  ('New Zealand Cricket',        'sport', 'nz', 2, 'manual'),
  ('New Zealand Olympic Committee','sport','nz',2, 'manual'),
  ('Netball Australia',          'sport', 'au', 2, 'manual'),
  ('Athletics Australia',        'sport', 'au', 2, 'manual'),
  ('Football Australia',         'sport', 'au', 2, 'manual'),
  ('Athletics New Zealand',      'sport', 'nz', 3, 'manual')
on conflict (name) do nothing;
