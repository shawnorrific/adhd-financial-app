-- Normalize NULL account_number to '' so the UNIQUE constraint
-- (account_number, post_date, description, amount) works correctly.
-- SQLite treats every NULL as distinct from every other NULL, which means
-- rows with identical data but NULL account_number are not caught as duplicates.
UPDATE transactions SET account_number = '' WHERE account_number IS NULL;
