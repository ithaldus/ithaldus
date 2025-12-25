-- Use COALESCE to handle NULL network_id (global credentials) properly in unique constraint
-- SQLite treats NULLs as distinct in unique indexes by default, COALESCE converts NULL to empty string
CREATE UNIQUE INDEX `idx_credentials_unique` ON `credentials` (`username`,`password`,COALESCE(`network_id`, ''));