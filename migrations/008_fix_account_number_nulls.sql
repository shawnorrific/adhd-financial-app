-- Normalize NULL account_number to '' so the UNIQUE constraint
-- (account_number, post_date, description, amount) works correctly.
-- SQLite treats every NULL as distinct, so rows with identical data but NULL
-- account_number are not caught as duplicates.
--
-- Step 1: collapse exact-duplicate NULL rows that only exist because NULL != NULL.
-- Keep the highest id (latest import) from each duplicate group.
DELETE FROM transactions
WHERE account_number IS NULL
  AND id NOT IN (
    SELECT MAX(id) FROM transactions
    WHERE  account_number IS NULL
    GROUP  BY post_date, description, amount
  );

-- Step 2: now all remaining NULL-account-number rows are unique by
-- (post_date, description, amount), so the UPDATE cannot violate the constraint.
UPDATE transactions SET account_number = '' WHERE account_number IS NULL;
