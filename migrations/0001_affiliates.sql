PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS affiliate_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,first_name TEXT NOT NULL,last_name TEXT NOT NULL,created_at TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN(0,1)));
CREATE TABLE IF NOT EXISTS affiliate_auth_tokens(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS affiliate_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES affiliate_users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS affiliate_sessions_user ON affiliate_sessions(user_id);
CREATE TABLE IF NOT EXISTS affiliate_rate_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS affiliate_deals(
 id TEXT PRIMARY KEY,affiliate_id TEXT NOT NULL REFERENCES affiliate_users(id),company TEXT NOT NULL,contact_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,location TEXT NOT NULL,solution TEXT NOT NULL,monthly_spend_cents INTEGER,referral_notes TEXT NOT NULL DEFAULT '',consent_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','reviewing','qualified','assessment','proposal','contracted','installation','completed','unsuccessful')),
 deal_value_cents INTEGER NOT NULL DEFAULT 0 CHECK(deal_value_cents>=0),commission_rate_bps INTEGER NOT NULL DEFAULT 300 CHECK(commission_rate_bps=300),
 commission_state TEXT NOT NULL DEFAULT 'pending' CHECK(commission_state IN('pending','earned','paid')),paid_at TEXT,payment_reference TEXT NOT NULL DEFAULT '',next_action TEXT NOT NULL DEFAULT '',follow_up_date TEXT NOT NULL DEFAULT '',public_update TEXT NOT NULL DEFAULT '',private_notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 CHECK(commission_state='pending' OR status='completed'),CHECK(commission_state!='paid' OR paid_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS affiliate_deals_owner ON affiliate_deals(affiliate_id,created_at);
CREATE INDEX IF NOT EXISTS affiliate_deals_status ON affiliate_deals(status,updated_at);
CREATE TABLE IF NOT EXISTS affiliate_deal_events(id TEXT PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES affiliate_deals(id),actor_id TEXT NOT NULL REFERENCES affiliate_users(id),event TEXT NOT NULL,public_message TEXT NOT NULL DEFAULT '',private_detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS affiliate_deal_events_deal ON affiliate_deal_events(deal_id,created_at);
