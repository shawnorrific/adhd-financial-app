-- 001_init.sql

-- core user profile
-- intentionally minimal — only things permanently true about a person
-- everything else lives in user_context
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  onboarding_completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- valid source values:
--   user_stated     — user said this directly and unprompted
--   user_confirmed  — ai hypothesized, user confirmed
--   user_corrected  — user pushed back and revised
--   ai_observed     — inferred from transaction data alone
--   ai_hypothesized — ai interpretation, not yet validated
--   transaction     — derived from spending data, no interpretation

-- valid status values:
--   observed        — noted but not yet interpreted
--   hypothesized    — ai has formed a tentative interpretation
--   confirmed       — validated by user or strong pattern
--   rejected        — user pushed back, confidence near 0
--   revised         — partially right, user added nuance

-- valid category values (ai may add new ones over time):
--   goal, worry, fear, hope, win, career, education,
--   emotion, self_criticism, history, health,
--   habit, neurodivergence

-- note: onboarding biggest_worry is written here as the first row
-- category: 'worry', source: 'user_stated', confidence: 1.0
-- it is not stored on user_profile — worries change, names don't

-- growing context about the user
CREATE TABLE IF NOT EXISTS user_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'observed',
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'ai_hypothesized',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- conversation sessions
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary TEXT,
  mood TEXT,
  drifted INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

-- individual messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- evidence linking context entries to supporting data
CREATE TABLE IF NOT EXISTS context_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_id INTEGER NOT NULL REFERENCES user_context(id),
  evidence_type TEXT NOT NULL,
  evidence_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- indexes for retrieval performance
CREATE INDEX IF NOT EXISTS idx_user_context_category
  ON user_context(category);
CREATE INDEX IF NOT EXISTS idx_user_context_status
  ON user_context(status);
CREATE INDEX IF NOT EXISTS idx_user_context_confidence
  ON user_context(confidence);
CREATE INDEX IF NOT EXISTS idx_user_context_source
  ON user_context(source);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_context_evidence_context
  ON context_evidence(context_id);
CREATE INDEX IF NOT EXISTS idx_context_evidence_type_id
  ON context_evidence(evidence_type, evidence_id);
