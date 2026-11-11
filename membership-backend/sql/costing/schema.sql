-- Recipe Costing setup. MySQL 8.0.16+ / InnoDB. Review and approve before execution.
-- No database selection: use the explicitly approved database connection.
-- Additive tables only; relationship validation and ownership belong to backend services.

CREATE TABLE IF NOT EXISTS costing_brands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  UNIQUE KEY (brand_id, code),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_units (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  dimension VARCHAR(10) NOT NULL CHECK (dimension IN ('MASS','VOLUME','COUNT')),
  canonical_factor DECIMAL(20,8) NOT NULL CHECK (canonical_factor > 0),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_staff_access (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  staff_user_id BIGINT UNSIGNED NOT NULL,
  permission VARCHAR(10) NOT NULL CHECK (permission IN ('VIEWER','EDITOR','ADMIN')),
  UNIQUE KEY (brand_id, location_id, staff_user_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_product_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY (brand_id, location_id, product_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('RAW','PREPARED','PACKAGING')),
  unit_code VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY (brand_id, location_id, code),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (unit_code),
  KEY (brand_id, location_id, kind, status, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_material_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(20,8) NOT NULL CHECK (amount >= 0),
  usable_quantity DECIMAL(20,8) NOT NULL CHECK (usable_quantity > 0),
  unit_code VARCHAR(10) NOT NULL,
  tax_basis VARCHAR(10) NOT NULL CHECK (tax_basis IN ('INCLUSIVE','EXCLUSIVE')),
  gst_rate DECIMAL(20,8) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 1),
  notes VARCHAR(500),
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, material_id, created_at, id),
  KEY (unit_code),
  KEY (brand_id, location_id, created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_material_price_heads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  price_id BIGINT UNSIGNED NOT NULL,
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY (brand_id, location_id, material_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, price_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_preparation_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL CHECK (revision > 0),
  instructions TEXT,
  created_by BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY (brand_id, location_id, material_id, revision),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_preparation_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  preparation_revision_id BIGINT UNSIGNED NOT NULL,
  input_material_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(20,8) NOT NULL CHECK (quantity > 0),
  unit_code VARCHAR(10) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, preparation_revision_id),
  KEY (brand_id, location_id, input_material_id),
  KEY (unit_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_yield_measurements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  preparation_revision_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(20,8) NOT NULL CHECK (quantity > 0),
  unit_code VARCHAR(10) NOT NULL,
  measured_at DATETIME(6) NOT NULL,
  notes VARCHAR(500),
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, preparation_revision_id, measured_at, id),
  KEY (unit_code),
  KEY (brand_id, location_id, created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_preparation_heads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  preparation_revision_id BIGINT UNSIGNED NOT NULL,
  yield_measurement_id BIGINT UNSIGNED NOT NULL,
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY (brand_id, location_id, material_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, preparation_revision_id),
  KEY (brand_id, location_id, yield_measurement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_sizes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  label VARCHAR(100) NOT NULL,
  nominal_volume_ml DECIMAL(20,8) CHECK (nominal_volume_ml > 0),
  UNIQUE KEY (brand_id, location_id, code),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_drink_recipes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, status, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_recipe_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  drink_recipe_id BIGINT UNSIGNED NOT NULL,
  size_id BIGINT UNSIGNED NOT NULL,
  product_link_id BIGINT UNSIGNED,
  price_source VARCHAR(10) NOT NULL CHECK (price_source IN ('PRODUCT','OVERRIDE')),
  price_override DECIMAL(20,8) CHECK (price_override >= 0),
  tax_basis VARCHAR(10) NOT NULL CHECK (tax_basis IN ('INCLUSIVE','EXCLUSIVE')),
  gst_rate DECIMAL(20,8) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 1),
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  CHECK ((price_source = 'PRODUCT' AND product_link_id IS NOT NULL AND price_override IS NULL) OR (price_source = 'OVERRIDE' AND price_override IS NOT NULL)),
  UNIQUE KEY (brand_id, location_id, drink_recipe_id, size_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, size_id),
  KEY (brand_id, location_id, product_link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_recipe_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL CHECK (revision > 0),
  created_by BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY (brand_id, location_id, variant_id, revision),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_recipe_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  recipe_revision_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(20,8) NOT NULL CHECK (quantity > 0),
  unit_code VARCHAR(10) NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, recipe_revision_id),
  KEY (brand_id, location_id, material_id),
  KEY (unit_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_recipe_heads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  recipe_revision_id BIGINT UNSIGNED NOT NULL,
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY (brand_id, location_id, variant_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, recipe_revision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_option_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  min_selections INT UNSIGNED NOT NULL DEFAULT 0,
  max_selections INT UNSIGNED NOT NULL DEFAULT 1,
  CHECK (max_selections >= min_selections),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  option_group_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('TOPPING','SUGAR','ICE','SUBSTITUTION','OTHER')),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, option_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_variant_option_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  option_group_id BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY (brand_id, location_id, variant_id, option_group_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, option_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_variant_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  option_group_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  max_portions INT UNSIGNED NOT NULL DEFAULT 1 CHECK (max_portions > 0),
  price_adjustment DECIMAL(20,8) NOT NULL DEFAULT 0,
  tax_basis VARCHAR(10) NOT NULL CHECK (tax_basis IN ('INCLUSIVE','EXCLUSIVE')),
  gst_rate DECIMAL(20,8) NOT NULL CHECK (gst_rate >= 0 AND gst_rate <= 1),
  UNIQUE KEY (brand_id, location_id, variant_id, option_id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, option_group_id),
  KEY (brand_id, location_id, option_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_option_effects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_option_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  recipe_revision_id BIGINT UNSIGNED NOT NULL,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('ADD','REMOVE','REPLACE','SET_QUANTITY')),
  target_line_id BIGINT UNSIGNED,
  material_id BIGINT UNSIGNED,
  quantity DECIMAL(20,8) CHECK (quantity >= 0),
  unit_code VARCHAR(10),
  CHECK ((operation = 'ADD' AND target_line_id IS NULL AND material_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0 AND unit_code IS NOT NULL) OR (operation = 'REMOVE' AND target_line_id IS NOT NULL AND material_id IS NULL AND quantity IS NULL AND unit_code IS NULL) OR (operation = 'REPLACE' AND target_line_id IS NOT NULL AND material_id IS NOT NULL AND quantity IS NOT NULL AND quantity > 0 AND unit_code IS NOT NULL) OR (operation = 'SET_QUANTITY' AND target_line_id IS NOT NULL AND material_id IS NULL AND quantity IS NOT NULL AND unit_code IS NOT NULL)),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, variant_option_id),
  KEY (brand_id, location_id, variant_id),
  KEY (brand_id, location_id, recipe_revision_id),
  KEY (brand_id, location_id, target_line_id),
  KEY (brand_id, location_id, material_id),
  KEY (unit_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costing_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(50) NOT NULL,
  details JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  KEY (brand_id, location_id, entity_type, entity_id, created_at, id),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY (brand_id, location_id, entity_id),
  KEY (brand_id, location_id, created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
