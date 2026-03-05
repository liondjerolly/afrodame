-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHÉMA SUPABASE — JEUX DE DAMES AFRICAINES
-- Exécutez ce script dans : Supabase Dashboard → SQL Editor → New Query → Run
-- URL: https://app.supabase.com/project/odaksyrfoujnpzzoetew/sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Supprimer les tables existantes (ordre inverse des dépendances) ──────────
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS challenges CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS admin_wallet_transactions CASCADE;
DROP TABLE IF EXISTS admin_wallet CASCADE;
DROP TABLE IF EXISTS admin_settings CASCADE;
DROP TABLE IF EXISTS players CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: players
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE players (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  phone               TEXT UNIQUE NOT NULL,
  email               TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,
  balance             NUMERIC(15,2) DEFAULT 0,
  virtual_balance_cdf NUMERIC(15,2) DEFAULT 54000,
  virtual_balance_usd NUMERIC(15,2) DEFAULT 200,
  total_wins          INTEGER DEFAULT 0,
  total_losses        INTEGER DEFAULT 0,
  total_draws         INTEGER DEFAULT 0,
  total_earnings      NUMERIC(15,2) DEFAULT 0,
  avatar              TEXT DEFAULT '😊',
  is_online           BOOLEAN DEFAULT false,
  preferred_currency  TEXT DEFAULT 'CDF' CHECK (preferred_currency IN ('CDF','USD')),
  role                TEXT DEFAULT 'player' CHECK (role IN ('player','admin')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_players_email ON players(email);
CREATE INDEX idx_players_phone ON players(phone);
CREATE INDEX idx_players_is_online ON players(is_online);
CREATE INDEX idx_players_total_wins ON players(total_wins DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: matches
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE matches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player1_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player2_id        UUID REFERENCES players(id) ON DELETE SET NULL,
  challenge_id      UUID UNIQUE,
  mode              TEXT NOT NULL CHECK (mode IN ('ai','online','challenge')),
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','finished','cancelled')),
  winner_id         UUID REFERENCES players(id) ON DELETE SET NULL,
  bet_amount        NUMERIC(15,2) DEFAULT 0,
  currency          TEXT DEFAULT 'CDF' CHECK (currency IN ('CDF','USD')),
  board_size        INTEGER DEFAULT 10,
  piece_count       INTEGER DEFAULT 12,
  time_per_turn     INTEGER DEFAULT 60,
  consecutive_draws INTEGER DEFAULT 0,
  board_state       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  finished_at       TIMESTAMPTZ
);

-- Index
CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_mode ON matches(mode);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: transactions
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('deposit','withdraw','win','loss','fee')),
  amount      NUMERIC(15,2) NOT NULL,
  currency    TEXT DEFAULT 'CDF' CHECK (currency IN ('CDF','USD')),
  description TEXT,
  status      TEXT DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  method      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_transactions_player ON transactions(player_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: notifications
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('challenge','win','loss','deposit','withdraw','chat','system')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  read        BOOLEAN DEFAULT false,
  from_player TEXT,
  amount      NUMERIC(15,2),
  match_id    UUID REFERENCES matches(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_notifications_player ON notifications(player_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: challenges
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE challenges (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_player_id     UUID REFERENCES players(id) ON DELETE CASCADE,
  accepted_by_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  from_player_name TEXT NOT NULL,
  bet_amount       NUMERIC(15,2) DEFAULT 0,
  currency         TEXT DEFAULT 'CDF' CHECK (currency IN ('CDF','USD')),
  piece_count      INTEGER DEFAULT 12,
  board_size       INTEGER DEFAULT 10,
  time_per_turn    INTEGER DEFAULT 60,
  status           TEXT DEFAULT 'open' CHECK (status IN ('open','accepted','cancelled','expired')),
  game_id          UUID REFERENCES matches(id) ON DELETE SET NULL,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '24 hours'),
  accepted_at      TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  expired_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_challenges_to_player ON challenges(to_player_id);
CREATE INDEX idx_challenges_from_player ON challenges(from_player_id);
CREATE INDEX idx_challenges_status ON challenges(status);
CREATE INDEX idx_challenges_status_expires ON challenges(status, expires_at);
CREATE INDEX idx_challenges_game_id ON challenges(game_id);

ALTER TABLE matches
  ADD CONSTRAINT matches_challenge_id_fkey
  FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: chat_messages
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id    UUID NOT NULL,
  sender_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_chat_match ON chat_messages(match_id);
CREATE INDEX idx_chat_created ON chat_messages(created_at ASC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: admin_wallet
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE admin_wallet (
  id              TEXT PRIMARY KEY DEFAULT 'main',
  balance_cdf     NUMERIC(15,2) DEFAULT 0,
  balance_usd     NUMERIC(15,2) DEFAULT 0,
  total_fees_cdf  NUMERIC(15,2) DEFAULT 0,
  total_fees_usd  NUMERIC(15,2) DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial row
INSERT INTO admin_wallet (id, balance_cdf, balance_usd) VALUES ('main', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: admin_wallet_transactions
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE admin_wallet_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT NOT NULL CHECK (type IN ('fee_in','deposit','withdraw')),
  amount      NUMERIC(15,2) NOT NULL,
  currency    TEXT DEFAULT 'CDF' CHECK (currency IN ('CDF','USD')),
  description TEXT,
  match_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_admin_wallet_txs_created ON admin_wallet_transactions(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE: admin_settings
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE admin_settings (
  id                    TEXT PRIMARY KEY DEFAULT 'global',
  ai_match_time         INTEGER DEFAULT 30,
  challenge_match_time  INTEGER DEFAULT 60,
  platform_fee          NUMERIC(5,2) DEFAULT 2,
  max_bet               NUMERIC(15,2) DEFAULT 500000,
  min_bet               NUMERIC(15,2) DEFAULT 500,
  cdf_rate              NUMERIC(10,2) DEFAULT 2800,
  usd_rate              NUMERIC(10,4) DEFAULT 1,
  default_currency      TEXT DEFAULT 'CDF' CHECK (default_currency IN ('CDF','USD')),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO admin_settings (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Activer RLS sur toutes les tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Politiques permissives (anon key) — pour app sans auth Supabase native
-- En production, remplacez par des politiques basées sur JWT

CREATE POLICY "allow_all_players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_matches" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notifications" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_challenges" ON challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_chat" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_admin_wallet" ON admin_wallet FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_admin_wallet_txs" ON admin_wallet_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_admin_settings" ON admin_settings FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REALTIME — Activer les publications temps réel
-- ═══════════════════════════════════════════════════════════════════════════════

-- Dans Supabase Dashboard → Database → Replication → Tables
-- Activez: players, matches, notifications, challenges, chat_messages

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS — updated_at automatique
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONNÉES DE DÉMO (optionnel)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Insérer des joueurs de démonstration
INSERT INTO players (id, first_name, last_name, phone, email, password_hash, balance, virtual_balance_cdf, virtual_balance_usd, total_wins, total_losses, total_draws, total_earnings, avatar, is_online, preferred_currency, role)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Kofi', 'Mensah', '+233200000001', 'kofi@dames.com', encode(convert_to('kofi123:dames_v1_salt', 'UTF8'), 'base64'), 180000, 54000, 200, 145, 42, 12, 520000, '🦁', true, 'CDF', 'player'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Amara', 'Diallo', '+224620000001', 'amara@dames.com', encode(convert_to('amara123:dames_v1_salt', 'UTF8'), 'base64'), 95000, 54000, 200, 132, 55, 8, 480000, '🐯', true, 'USD', 'player'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Fatou', 'Camara', '+221770000001', 'fatou@dames.com', encode(convert_to('fatou123:dames_v1_salt', 'UTF8'), 'base64'), 62000, 54000, 200, 118, 67, 15, 420000, '🦅', false, 'CDF', 'player'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'Kwame', 'Asante', '+233244000001', 'kwame@dames.com', encode(convert_to('kwame123:dames_v1_salt', 'UTF8'), 'base64'), 44000, 54000, 200, 97, 78, 21, 350000, '🦊', true, 'CDF', 'player'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'Mamadou', 'Diallo', '+243820000001', 'demo@dames.com', encode(convert_to('demo123:dames_v1_salt', 'UTF8'), 'base64'), 250000, 54000, 200, 23, 8, 3, 125000, '👑', true, 'CDF', 'player')
ON CONFLICT (id) DO NOTHING;

-- Paramètres admin par défaut
INSERT INTO admin_settings (id, ai_match_time, challenge_match_time, platform_fee, max_bet, min_bet, cdf_rate, usd_rate)
VALUES ('global', 30, 60, 2, 500000, 500, 2800, 1)
ON CONFLICT (id) DO UPDATE SET
  ai_match_time = EXCLUDED.ai_match_time,
  challenge_match_time = EXCLUDED.challenge_match_time;

-- =============================================================================
-- STEP 2 - ARENE IA, SPECTATEURS, ANALYSE
-- =============================================================================

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_mode_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_mode_check
  CHECK (mode IN ('ai', 'online', 'challenge', 'ai_arena'));

CREATE TABLE IF NOT EXISTS match_moves (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  move_number     INTEGER NOT NULL CHECK (move_number > 0),
  from_row        INTEGER NOT NULL,
  from_col        INTEGER NOT NULL,
  to_row          INTEGER NOT NULL,
  to_col          INTEGER NOT NULL,
  captured_pieces JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_type     TEXT NOT NULL CHECK (player_type IN ('human', 'ai')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_moves_match ON match_moves(match_id);
CREATE INDEX IF NOT EXISTS idx_match_moves_order ON match_moves(match_id, move_number);
CREATE INDEX IF NOT EXISTS idx_match_moves_created ON match_moves(created_at DESC);

CREATE OR REPLACE FUNCTION is_match_move_writable(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM matches
  WHERE id = p_match_id;

  RETURN v_status = 'active';
END;
$$;

ALTER TABLE match_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS match_moves_select_all ON match_moves;
DROP POLICY IF EXISTS match_moves_insert_if_active ON match_moves;

CREATE POLICY match_moves_select_all
ON match_moves
FOR SELECT
USING (true);

CREATE POLICY match_moves_insert_if_active
ON match_moves
FOR INSERT
WITH CHECK (is_match_move_writable(match_id));
