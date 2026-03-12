-- Add frequency to bills: weekly | biweekly | semimonthly | monthly (null = not set)
ALTER TABLE bills ADD COLUMN frequency TEXT;
