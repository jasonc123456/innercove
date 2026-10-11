CREATE TABLE check_in_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  event_id TEXT NOT NULL,
  day TEXT NOT NULL CHECK(length(day)=10),
  mood TEXT NOT NULL CHECK(mood IN ('bright','steady','calm','heavy','low')),
  time_zone TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE(user_id,event_id)
);
--> statement-breakpoint
CREATE INDEX check_in_events_user_day ON check_in_events(user_id,day,sequence);
--> statement-breakpoint
CREATE TABLE daily_check_ins (
  user_id TEXT NOT NULL REFERENCES users(user_id),
  day TEXT NOT NULL CHECK(length(day)=10),
  mood TEXT NOT NULL CHECK(mood IN ('bright','steady','calm','heavy','low')),
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_sequence INTEGER NOT NULL,
  PRIMARY KEY(user_id,day)
);
--> statement-breakpoint
CREATE TABLE tree_progress (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(user_id),
  acknowledged_stage INTEGER NOT NULL CHECK(acknowledged_stage BETWEEN 1 AND 3)
);
