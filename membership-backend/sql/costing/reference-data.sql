-- Repeatable essential reference inserts; existing records are never overwritten.
-- No prices, GST assumptions, sizes, staff grants or product links.
-- Check existing reference definitions first; execute on the same approved connection.
START TRANSACTION;
INSERT INTO costing_brands (code, name, currency_code)
SELECT 'TEA_TALK', 'TEA TALK', 'NZD'
WHERE NOT EXISTS (SELECT 1 FROM costing_brands WHERE code = 'TEA_TALK');

INSERT INTO costing_locations (brand_id, code, name)
SELECT b.id, 'WESTGATE', 'Westgate' FROM costing_brands b
WHERE b.code = 'TEA_TALK'
  AND NOT EXISTS (
    SELECT 1 FROM costing_locations l
    WHERE l.brand_id = b.id AND l.code = 'WESTGATE'
  );

INSERT INTO costing_units (code, dimension, canonical_factor)
SELECT seed.code, seed.dimension, seed.factor
FROM (
  SELECT 'g' AS code, 'MASS' AS dimension, 1 AS factor
  UNION ALL SELECT 'kg', 'MASS', 1000
  UNION ALL SELECT 'ml', 'VOLUME', 1
  UNION ALL SELECT 'l', 'VOLUME', 1000
  UNION ALL SELECT 'each', 'COUNT', 1
  UNION ALL SELECT 'dozen', 'COUNT', 12
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM costing_units u WHERE u.code = seed.code);

COMMIT;
