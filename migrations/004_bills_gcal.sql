-- Extend bills with user notes and Google Calendar sync tracking
ALTER TABLE bills ADD COLUMN notes            TEXT;
ALTER TABLE bills ADD COLUMN calendar_event_id TEXT;

-- Google Calendar OAuth credentials and tokens
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('google_client_id',     ''),
  ('google_client_secret', ''),
  ('google_refresh_token', ''),
  ('google_access_token',  ''),
  ('google_token_expiry',  '0'),
  ('google_user_email',    '');
