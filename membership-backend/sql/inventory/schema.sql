-- Inventory v1: additive local setup, logical IDs only; no automatic execution.
CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  base_unit VARCHAR(10) NOT NULL CHECK (base_unit IN ('g','ml','each')),
  current_spec_id BIGINT UNSIGNED,
  minimum_quantity DECIMAL(20,8) CHECK (minimum_quantity >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY (brand_id,location_id,code),
  UNIQUE KEY (brand_id,location_id,material_id),
  KEY (brand_id,location_id,current_spec_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_item_specs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  quantity DECIMAL(20,8) NOT NULL CHECK (quantity > 0),
  unit_code VARCHAR(10) NOT NULL CHECK (unit_code IN ('g','ml','each')),
  source_text VARCHAR(100) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY (brand_id,location_id,item_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_balances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(20,8) NOT NULL CHECK (quantity >= 0),
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  UNIQUE KEY (brand_id,location_id,item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('OPENING','RECEIPT','ISSUE','WASTE','COUNT','REVERSAL')),
  quantity_delta DECIMAL(20,8) NOT NULL,
  quantity_before DECIMAL(20,8),
  quantity_after DECIMAL(20,8) NOT NULL CHECK (quantity_after >= 0),
  unit_code VARCHAR(10) NOT NULL CHECK (unit_code IN ('g','ml','each')),
  observed_date DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  request_id VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  reversal_of BIGINT UNSIGNED,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY (brand_id,location_id,request_id),
  UNIQUE KEY (brand_id,location_id,reversal_of),
  KEY (brand_id,location_id,item_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  content_hash CHAR(64) NOT NULL,
  payload JSON NOT NULL,
  result JSON,
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW','COMPLETED')),
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6),
  UNIQUE KEY (brand_id,location_id,content_hash),
  KEY (brand_id,location_id,status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
