CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  report_type TEXT DEFAULT 'image',
  prompt TEXT NOT NULL,
  image_prompt TEXT,
  image_url TEXT,
  api_response TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
