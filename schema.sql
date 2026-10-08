-- Optional durable enquiry inbox. Bind the D1 database as LEADS_DB.
CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','email_failed')),
  email_id TEXT
);
CREATE INDEX IF NOT EXISTS enquiries_status_created ON enquiries(status, created_at);
