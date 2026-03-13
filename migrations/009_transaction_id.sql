-- Add a stable unique identifier for each transaction so that re-importing
-- the same CSV never creates duplicates, regardless of account_number.
-- UNIQUE allows multiple NULLs (SQLite semantics), so existing rows without
-- an id coexist without conflict.
ALTER TABLE transactions ADD COLUMN transaction_id TEXT UNIQUE;
