-- The most recently used plan for each resistance exercise.  This survives
-- removing an exercise from a template, while remaining scoped to its owner.
CREATE TABLE IF NOT EXISTS exercise_defaults (
  user_id TEXT NOT NULL,
  part TEXT NOT NULL,
  name TEXT NOT NULL,
  sets_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, part, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
