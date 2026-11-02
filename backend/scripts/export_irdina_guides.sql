-- Converts Nur Ildina's guides (Neon project tour_guide_platform) into the CSV format
-- of scripts/seed_guides.py. Read-only: it changes nothing in her database.
--
-- How to use: run it in Neon's SQL Editor on tour_guide_platform, download the result
-- as CSV, save it as backend/data/irdina_guides.csv, then load it with
--   python -m scripts.seed_guides data/irdina_guides.csv --dry-run
--   python -m scripts.seed_guides data/irdina_guides.csv --days 90
WITH
langs AS (
  SELECT guide_id, string_agg(code, ',' ORDER BY code) AS languages
  FROM (
    SELECT DISTINCT guide_id,
      CASE language
        WHEN 'Korean' THEN 'ko'
        WHEN 'English' THEN 'en'
        WHEN 'Indonesian' THEN 'id'
        WHEN 'Malay' THEN 'ms'
        WHEN 'Thai' THEN 'th'
        WHEN 'Vietnamese' THEN 'vi'
        WHEN 'Japanese' THEN 'ja'
        WHEN 'Chinese' THEN 'zh'
        WHEN 'Mandarin' THEN 'zh'
      END AS code
    FROM guide_languages
  ) x
  WHERE code IS NOT NULL
  GROUP BY guide_id
),
regs AS (
  SELECT s.guide_id, string_agg(DISTINCT upper(l.name), ',') AS regions
  FROM guide_service_areas s
  JOIN locations l ON l.location_id = s.location_id
  WHERE l.name IN ('Seoul', 'Busan', 'Jeju')
  GROUP BY s.guide_id
),
attrs AS (
  SELECT guide_id, string_agg(code, ',' ORDER BY code) AS attributes
  FROM (
    SELECT DISTINCT g.guide_id,
      CASE a.attribute_name
        WHEN 'Cafes' THEN 'CAFE'
        WHEN 'Culture' THEN 'CULTURE'
        WHEN 'Food' THEN 'FOOD'
        WHEN 'Local restaurants' THEN 'FOOD'
        WHEN 'K-pop' THEN 'KPOP'
        WHEN 'K-pop locations' THEN 'KPOP'
        WHEN 'Nature' THEN 'NATURE'
        WHEN 'Shopping' THEN 'SHOPPING'
      END AS code
    FROM guide_attributes g
    JOIN attributes a ON a.attribute_id = g.attribute_id
  ) x
  WHERE code IS NOT NULL
  GROUP BY guide_id
),
access AS (
  SELECT guide_id, string_agg(code, ',' ORDER BY code) AS accessibility_experience
  FROM (
    SELECT DISTINCT guide_id,
      CASE accessibility_support
        WHEN 'WHEELCHAIR_ACCESS' THEN 'WHEELCHAIR_SUPPORT'
        WHEN 'LIMITED_WALKING' THEN 'SLOW_WALK_SUPPORT'
        WHEN 'AVOID_STAIRS' THEN 'SLOW_WALK_SUPPORT'
      END AS code
    FROM guide_accessibility_support
  ) x
  WHERE code IS NOT NULL
  GROUP BY guide_id
),
transport AS (
  SELECT guide_id, string_agg(code, ',' ORDER BY code DESC) AS transport_options
  FROM (
    SELECT DISTINCT guide_id,
      CASE transportation_type
        WHEN 'PUBLIC' THEN 'PUBLIC_TRANSIT'
        WHEN 'PRIVATE' THEN 'CAN_ARRANGE_CAR'
      END AS code
    FROM guide_transportation
  ) x
  WHERE code IS NOT NULL
  GROUP BY guide_id
)
SELECT
  g.name AS full_name,
  lower(regexp_replace(g.name, '[^A-Za-z]', '', 'g')) || '.guide' || g.guide_id
    || '@example.com' AS email,
  g.gender,
  g.description,
  COALESCE(langs.languages, 'ko') AS languages,
  regs.regions,
  COALESCE(attrs.attributes, '') AS attributes,
  COALESCE(access.accessibility_experience, '') AS accessibility_experience,
  COALESCE(transport.transport_options, 'PUBLIC_TRANSIT') AS transport_options,
  g.max_group_size,
  CASE WHEN g.license_verified THEN 'TRUE' ELSE 'FALSE' END AS verified,
  -- no rating yet = no reviews (not "0.0 from 46 reviews")
  CASE WHEN g.rating IS NULL THEN 0 ELSE g.rating END AS rating_average,
  CASE WHEN g.rating IS NULL THEN 0 ELSE COALESCE(g.review_count, 0) END AS rating_count,
  round(g.price_per_hour)::int AS micro_hourly_rate,
  2 AS micro_min_hours,
  4 AS micro_max_hours,
  round(g.price_per_day)::int AS full_day_rate
FROM guides g
JOIN regs ON regs.guide_id = g.guide_id  -- guides with no Seoul, Busan or Jeju are left out
LEFT JOIN langs ON langs.guide_id = g.guide_id
LEFT JOIN attrs ON attrs.guide_id = g.guide_id
LEFT JOIN access ON access.guide_id = g.guide_id
LEFT JOIN transport ON transport.guide_id = g.guide_id
WHERE g.gender IN ('MALE', 'FEMALE')  -- OTHER is not in your backend's gender list yet
ORDER BY g.guide_id;
