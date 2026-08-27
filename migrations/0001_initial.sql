PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cardio', 'resistance')),
  name TEXT NOT NULL,
  cardio_action TEXT,
  cardio_speed REAL,
  cardio_duration INTEGER,
  resistance_parts TEXT,
  resistance_exercises TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_templates_user_created ON templates(user_id, created_at);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cardio', 'resistance')),
  template_id TEXT,
  template_name TEXT NOT NULL,
  cardio_action TEXT,
  cardio_speed REAL,
  cardio_duration INTEGER,
  resistance_exercises TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  sync_calendar INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  mood INTEGER,
  session INTEGER NOT NULL DEFAULT 0,
  calendar_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_records_user_date ON records(user_id, date, created_at);

CREATE TABLE IF NOT EXISTS weekly_plan_versions (
  user_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, effective_from),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_library (
  user_id TEXT PRIMARY KEY,
  library_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
