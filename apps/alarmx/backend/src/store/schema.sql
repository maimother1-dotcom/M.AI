-- AlarmX schema.
--
-- The constraints below are not documentation of intent; they are the
-- enforcement. Application code can regress, be bypassed, or be called from a
-- migration script. A unique index cannot.

CREATE TABLE users (
  user_id                       UUID PRIMARY KEY,
  -- HMAC of the number, never the number. PRD 18.2.
  phone_hash                    TEXT,
  device_hash                   TEXT,
  pinned_utc_offset_minutes     INTEGER  NOT NULL,
  created_at_ms                 BIGINT   NOT NULL,

  -- Money is integer paise. NUMERIC(20,0), never a float type: PRD 18.3 is a
  -- finding about rounding, and a DOUBLE PRECISION column would reintroduce it
  -- underneath correct application code.
  lifetime_earned_paise         NUMERIC(20,0) NOT NULL DEFAULT 0 CHECK (lifetime_earned_paise >= 0),
  withdrawable_paise            NUMERIC(20,0) NOT NULL DEFAULT 0 CHECK (withdrawable_paise >= 0),
  carry_micropaise              NUMERIC(20,0) NOT NULL DEFAULT 0
                                  CHECK (carry_micropaise >= 0 AND carry_micropaise < 1000),

  streak_days                   INTEGER  NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  distinct_alarm_days           INTEGER  NOT NULL DEFAULT 0 CHECK (distinct_alarm_days >= 0),
  alarm_completed_for_day       BIGINT,
  credited_views_today          INTEGER  NOT NULL DEFAULT 0
                                  CHECK (credited_views_today >= 0 AND credited_views_today <= 20),
  current_day_index             BIGINT   NOT NULL DEFAULT 0,
  last_day_start_ms             BIGINT   NOT NULL DEFAULT 0,
  last_timezone_change_day      BIGINT,

  spin_bonus_basis_points       INTEGER  NOT NULL DEFAULT 0
                                  CHECK (spin_bonus_basis_points BETWEEN 0 AND 10000),
  under_review                  BOOLEAN  NOT NULL DEFAULT FALSE,
  has_withdrawn_ever            BOOLEAN  NOT NULL DEFAULT FALSE,
  deleted_at_ms                 BIGINT
);

-- One live account per number. Partial, so deleted rows (phone_hash NULL) do
-- not collide with each other.
CREATE UNIQUE INDEX users_phone_hash_key ON users (phone_hash) WHERE phone_hash IS NOT NULL;

-- Sessions are opaque random tokens, stored hashed. A dump of this table
-- yields nothing an attacker can present. PRD 18.1.
CREATE TABLE sessions (
  token_hash     TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at_ms  BIGINT NOT NULL
);
CREATE INDEX sessions_user_id ON sessions (user_id);

-- THE anti-replay control. PRD 18.8.
--
-- A credit is only possible if the insert here succeeds. Checking for a row and
-- then inserting one is the same race in a different costume, so the code never
-- does that: it inserts and handles the collision.
CREATE TABLE claims (
  user_id   UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('ssv', 'payout')),
  key       TEXT NOT NULL,
  at_ms     BIGINT NOT NULL,
  PRIMARY KEY (user_id, kind, key)
);

-- Immutable audit log, written before the wallet moves. PRD 18.8.
CREATE TABLE ledger (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  day_index         BIGINT NOT NULL,
  at_ms             BIGINT NOT NULL,
  verified          BOOLEAN NOT NULL,
  gross_micropaise  NUMERIC(20,0) NOT NULL CHECK (gross_micropaise >= 0),
  tier              TEXT,
  credited_paise    NUMERIC(20,0) NOT NULL CHECK (credited_paise >= 0),
  idempotency_key   TEXT,
  rejected_for      TEXT
);
CREATE INDEX ledger_user_day ON ledger (user_id, day_index);

-- Financial records. Retained through account deletion: they carry a legal
-- retention period and hold no personal data beyond a VPA hash.
CREATE TABLE payouts (
  user_id     UUID NOT NULL,
  request_id  TEXT NOT NULL,
  amount_paise NUMERIC(20,0) NOT NULL CHECK (amount_paise > 0),
  at_ms       BIGINT NOT NULL,
  vpa_hash    TEXT NOT NULL,
  PRIMARY KEY (user_id, request_id)
);

CREATE TABLE rate_hits (
  subject  TEXT NOT NULL,
  at_ms    BIGINT NOT NULL
);
CREATE INDEX rate_hits_subject_at ON rate_hits (subject, at_ms);
