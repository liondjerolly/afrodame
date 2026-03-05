/**
 * DATABASE SERVICE — JEUX DE DAMES AFRICAINES
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture hybride :
 *   1. localStorage  → toujours disponible, données immédiates
 *   2. Supabase      → synchronisation cloud si tables disponibles
 *
 * Si les tables Supabase n'existent pas encore, toutes les opérations
 * fonctionnent 100% en local sans aucune erreur console.
 */

import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

// ─── Local Storage keys ────────────────────────────────────────────────────────
const LS = {
  players:      'dames_players',
  matches:      'dames_matches',
  matchMoves:   'dames_match_moves',
  transactions: 'dames_transactions',
  notifications:'dames_notifications',
  challenges:   'dames_challenges',
  chat:         'dames_chat',
  settings:     'dames_settings',
};

// ─── Supabase table availability cache ────────────────────────────────────────
// Évite des requêtes répétées vers des tables inexistantes
const tableStatus: Record<string, boolean | null> = {
  players: null,
  matches: null,
  transactions: null,
  notifications: null,
  challenges: null,
  chat_messages: null,
  match_moves: null,
  admin_wallet: null,
  admin_wallet_transactions: null,
  admin_settings: null,
};

// Statut global de la connexion Supabase
let supabaseReady = false;
let supabaseChecked = false;

// ─── localStorage helpers ──────────────────────────────────────────────────────
function ls<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota exceeded */ }
}

async function safeInsert(tableName: string, data: Record<string, unknown>): Promise<boolean> {
  if (supabaseChecked && !supabaseReady) return false;
  if (tableStatus[tableName] === false) return false;

  try {
    const { error } = await supabase.from(tableName).insert(data);
    if (error) {
      const msg = error.message || '';
      if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
        tableStatus[tableName] = false;
      }
      return false;
    }
    tableStatus[tableName] = true;
    return true;
  } catch {
    return false;
  }
}

async function safeUpsert(tableName: string, data: Record<string, unknown>, conflict: string): Promise<boolean> {
  if (supabaseChecked && !supabaseReady) return false;
  if (tableStatus[tableName] === false) return false;

  try {
    const { error } = await supabase.from(tableName).upsert(data, { onConflict: conflict });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
        tableStatus[tableName] = false;
      }
      return false;
    }
    tableStatus[tableName] = true;
    return true;
  } catch {
    return false;
  }
}

async function safeUpdate(tableName: string, data: Record<string, unknown>, match: Record<string, unknown>): Promise<boolean> {
  if (supabaseChecked && !supabaseReady) return false;
  if (tableStatus[tableName] === false) return false;

  try {
    const entries = Object.entries(match);
    if (entries.length === 0) return false;
    const [firstKey, firstVal] = entries[0];
    let q = supabase.from(tableName).update(data).eq(firstKey, firstVal as string);
    for (let i = 1; i < entries.length; i++) {
      q = q.eq(entries[i][0], entries[i][1] as string);
    }
    const { error } = await q;
    if (error) {
      if ((error as { code?: string }).code === '42P01') tableStatus[tableName] = false;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function safeDelete(tableName: string, match: Record<string, unknown>): Promise<boolean> {
  if (supabaseChecked && !supabaseReady) return false;
  if (tableStatus[tableName] === false) return false;

  try {
    const entries = Object.entries(match);
    if (entries.length === 0) return false;
    const [firstKey, firstVal] = entries[0];
    let q = supabase.from(tableName).delete().eq(firstKey, firstVal as string);
    for (let i = 1; i < entries.length; i++) {
      q = q.eq(entries[i][0], entries[i][1] as string);
    }
    const { error } = await q;
    if (error) {
      if ((error as { code?: string }).code === '42P01') tableStatus[tableName] = false;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PLAYER OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlayerData {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passwordHash: string;
  balance: number;
  virtualBalanceCDF: number;
  virtualBalanceUSD: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalEarnings: number;
  avatar: string;
  isOnline: boolean;
  preferredCurrency: 'CDF' | 'USD';
  role: 'player' | 'admin';
  createdAt: string;
}

function dbRowToPlayer(row: Record<string, unknown>): PlayerData {
  return {
    id: row.id as string,
    firstName: (row.first_name as string) || '',
    lastName: (row.last_name as string) || '',
    phone: (row.phone as string) || '',
    email: (row.email as string) || '',
    passwordHash: (row.password_hash as string) || '',
    balance: Number(row.balance) || 0,
    virtualBalanceCDF: row.virtual_balance_cdf != null ? Number(row.virtual_balance_cdf) : 54000,
    virtualBalanceUSD: row.virtual_balance_usd != null ? Number(row.virtual_balance_usd) : 200,
    totalWins: Number(row.total_wins) || 0,
    totalLosses: Number(row.total_losses) || 0,
    totalDraws: Number(row.total_draws) || 0,
    totalEarnings: Number(row.total_earnings) || 0,
    avatar: (row.avatar as string) || '😊',
    isOnline: Boolean(row.is_online),
    preferredCurrency: (row.preferred_currency as 'CDF' | 'USD') || 'CDF',
    role: (row.role as 'player' | 'admin') || 'player',
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export const PlayerService = {

  async create(data: Omit<PlayerData, 'id' | 'createdAt'>): Promise<PlayerData | null> {
    const player: PlayerData = {
      ...data,
      virtualBalanceCDF: data.virtualBalanceCDF ?? 54000,
      virtualBalanceUSD: data.virtualBalanceUSD ?? 200,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };

    // Sauvegarder localement d'abord (toujours fiable)
    const players = ls<PlayerData[]>(LS.players, []);
    players.push(player);
    lsSet(LS.players, players);

    // Tenter Supabase en arrière-plan
    await safeInsert('players', {
      id: player.id,
      first_name: player.firstName,
      last_name: player.lastName,
      phone: player.phone,
      email: player.email,
      password_hash: player.passwordHash,
      balance: player.balance,
      virtual_balance_cdf: player.virtualBalanceCDF,
      virtual_balance_usd: player.virtualBalanceUSD,
      total_wins: player.totalWins,
      total_losses: player.totalLosses,
      total_draws: player.totalDraws,
      total_earnings: player.totalEarnings,
      avatar: player.avatar,
      is_online: player.isOnline,
      preferred_currency: player.preferredCurrency,
      role: player.role,
    });

    return player;
  },

  async findByPhone(phone: string): Promise<PlayerData | null> {
    // Chercher d'abord en local (plus rapide)
    const players = ls<PlayerData[]>(LS.players, getDefaultPlayers());
    const local = players.find(p => p.phone === phone) || null;
    if (local) return local;

    // Puis Supabase (silencieux si table absente)
    if (tableStatus['players'] === false) return null;
    try {
      const { data, error } = await supabase.from('players').select('*').eq('phone', phone).maybeSingle();
      if (!error && data) return dbRowToPlayer(data as Record<string, unknown>);
    } catch { /* silencieux */ }
    return null;
  },

  async findByEmail(email: string): Promise<PlayerData | null> {
    const players = ls<PlayerData[]>(LS.players, getDefaultPlayers());
    const local = players.find(p => p.email === email) || null;
    if (local) return local;

    if (tableStatus['players'] === false) return null;
    try {
      const { data, error } = await supabase.from('players').select('*').eq('email', email).maybeSingle();
      if (!error && data) return dbRowToPlayer(data as Record<string, unknown>);
    } catch { /* silencieux */ }
    return null;
  },

  async findById(id: string): Promise<PlayerData | null> {
    const players = ls<PlayerData[]>(LS.players, getDefaultPlayers());
    const local = players.find(p => p.id === id) || null;
    if (local) return local;

    if (tableStatus['players'] === false) return null;
    try {
      const { data, error } = await supabase.from('players').select('*').eq('id', id).maybeSingle();
      if (!error && data) return dbRowToPlayer(data as Record<string, unknown>);
    } catch { /* silencieux */ }
    return null;
  },

  async update(id: string, updates: Partial<PlayerData>): Promise<PlayerData | null> {
    // Mettre à jour localement d'abord
    const players = ls<PlayerData[]>(LS.players, getDefaultPlayers());
    const idx = players.findIndex(p => p.id === id);
    if (idx >= 0) {
      players[idx] = { ...players[idx], ...updates };
      lsSet(LS.players, players);
    }

    // Sync Supabase en arrière-plan
    const dbUpdates: Record<string, unknown> = {};
    if (updates.balance !== undefined)           dbUpdates.balance = updates.balance;
    if (updates.virtualBalanceCDF !== undefined) dbUpdates.virtual_balance_cdf = updates.virtualBalanceCDF;
    if (updates.virtualBalanceUSD !== undefined) dbUpdates.virtual_balance_usd = updates.virtualBalanceUSD;
    if (updates.totalWins !== undefined)         dbUpdates.total_wins = updates.totalWins;
    if (updates.totalLosses !== undefined)       dbUpdates.total_losses = updates.totalLosses;
    if (updates.totalDraws !== undefined)        dbUpdates.total_draws = updates.totalDraws;
    if (updates.totalEarnings !== undefined)     dbUpdates.total_earnings = updates.totalEarnings;
    if (updates.isOnline !== undefined)          dbUpdates.is_online = updates.isOnline;
    if (updates.preferredCurrency)               dbUpdates.preferred_currency = updates.preferredCurrency;
    if (updates.firstName !== undefined)         dbUpdates.first_name = updates.firstName;
    if (updates.lastName !== undefined)          dbUpdates.last_name = updates.lastName;
    if (updates.phone !== undefined)             dbUpdates.phone = updates.phone;
    if (updates.email !== undefined)             dbUpdates.email = updates.email;
    if (updates.avatar !== undefined)            dbUpdates.avatar = updates.avatar;
    if (updates.passwordHash !== undefined)      dbUpdates.password_hash = updates.passwordHash;
    dbUpdates.updated_at = new Date().toISOString();

    if (Object.keys(dbUpdates).length > 1) {
      await safeUpdate('players', dbUpdates, { id });
    }

    return idx >= 0 ? players[idx] : null;
  },

  async setOnline(id: string, online: boolean): Promise<void> {
    const players = ls<PlayerData[]>(LS.players, []);
    const idx = players.findIndex(p => p.id === id);
    if (idx >= 0) { players[idx].isOnline = online; lsSet(LS.players, players); }
    await safeUpdate('players', { is_online: online, updated_at: new Date().toISOString() }, { id });
  },

  async getLeaderboard(): Promise<PlayerData[]> {
    // Toujours retourner les données locales (synchronisées)
    const players = ls<PlayerData[]>(LS.players, getDefaultPlayers());
    return [...players].sort((a, b) => b.totalWins - a.totalWins).slice(0, 50);
  },

  async getOnlinePlayers(): Promise<PlayerData[]> {
    const players = ls<PlayerData[]>(LS.players, getDefaultPlayers());
    return players.filter(p => p.isOnline);
  },

  async sendPasswordReset(email: string): Promise<boolean> {
    const player = await PlayerService.findByEmail(email);
    if (!player) return false;
    const token = Math.random().toString(36).slice(2, 10).toUpperCase();
    console.info(`[PASSWORD RESET] Email: ${email} — Mot de passe temporaire: ${token}`);
    return true;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MATCH OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface MatchData {
  id: string;
  player1Id: string;
  player2Id: string | null;
  challengeId: string | null;
  mode: 'ai' | 'online' | 'challenge' | 'ai_arena';
  status: 'pending' | 'active' | 'finished' | 'cancelled';
  winnerId: string | null;
  betAmount: number;
  currency: 'CDF' | 'USD';
  boardSize: number;
  pieceCount: number;
  timePerTurn: number;
  consecutiveDraws: number;
  boardState: string;
  createdAt: string;
  finishedAt: string | null;
}

function dbRowToMatch(row: Record<string, unknown>): MatchData {
  return {
    id: row.id as string,
    player1Id: row.player1_id as string,
    player2Id: (row.player2_id as string | null) ?? null,
    challengeId: (row.challenge_id as string | null) ?? null,
    mode: row.mode as MatchData['mode'],
    status: row.status as MatchData['status'],
    winnerId: (row.winner_id as string | null) ?? null,
    betAmount: Number(row.bet_amount) || 0,
    currency: ((row.currency as 'CDF' | 'USD') || 'CDF'),
    boardSize: Number(row.board_size) || 10,
    pieceCount: Number(row.piece_count) || 12,
    timePerTurn: Number(row.time_per_turn) || 60,
    consecutiveDraws: Number(row.consecutive_draws) || 0,
    boardState: (row.board_state as string) || '',
    createdAt: (row.created_at as string) || new Date().toISOString(),
    finishedAt: (row.finished_at as string | null) ?? null,
  };
}

export const MatchService = {

  async create(data: Omit<MatchData, 'id' | 'createdAt'>): Promise<MatchData | null> {
    // Ne JAMAIS stocker les matchs IA
    if (data.mode === 'ai') {
      return { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    }

    const match: MatchData = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };

    // Local d'abord
    const matches = ls<MatchData[]>(LS.matches, []);
    matches.push(match);
    lsSet(LS.matches, matches);

    // Supabase en arrière-plan
    await safeInsert('matches', {
      id: match.id,
      player1_id: match.player1Id,
      player2_id: match.player2Id,
      challenge_id: match.challengeId,
      mode: match.mode,
      status: match.status,
      winner_id: match.winnerId,
      bet_amount: match.betAmount,
      currency: match.currency,
      board_size: match.boardSize,
      piece_count: match.pieceCount,
      time_per_turn: match.timePerTurn,
      consecutive_draws: match.consecutiveDraws,
      board_state: match.boardState,
    });

    return match;
  },

  async findById(id: string): Promise<MatchData | null> {
    const localMatches = ls<MatchData[]>(LS.matches, []);
    const local = localMatches.find(m => m.id === id) || null;

    if (tableStatus['matches'] !== false) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) {
          const mapped = dbRowToMatch(data as Record<string, unknown>);
          if (!localMatches.find(m => m.id === mapped.id)) {
            lsSet(LS.matches, [mapped, ...localMatches]);
          }
          return mapped;
        }
      } catch {
        // silencieux, fallback local
      }
    }

    return local;
  },

  async findByChallengeId(challengeId: string): Promise<MatchData | null> {
    if (tableStatus['matches'] !== false) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('challenge_id', challengeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) return dbRowToMatch(data as Record<string, unknown>);
      } catch {
        // silencieux
      }
    }

    const localMatches = ls<MatchData[]>(LS.matches, []);
    return localMatches.find(m => m.challengeId === challengeId) || null;
  },

  async update(id: string, updates: Partial<MatchData>): Promise<void> {
    const matches = ls<MatchData[]>(LS.matches, []);
    const idx = matches.findIndex(m => m.id === id);
    if (idx >= 0) { matches[idx] = { ...matches[idx], ...updates }; lsSet(LS.matches, matches); }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined)          dbUpdates.status = updates.status;
    if (updates.winnerId !== undefined)        dbUpdates.winner_id = updates.winnerId;
    if (updates.consecutiveDraws !== undefined) dbUpdates.consecutive_draws = updates.consecutiveDraws;
    if (updates.boardState !== undefined)      dbUpdates.board_state = updates.boardState;
    if (updates.finishedAt !== undefined)      dbUpdates.finished_at = updates.finishedAt;

    if (Object.keys(dbUpdates).length > 0) {
      await safeUpdate('matches', dbUpdates, { id });
    }
  },

  async deleteFinished(matchId: string): Promise<void> {
    // Supprimer localement
    let matches = ls<MatchData[]>(LS.matches, []);
    matches = matches.filter(m => m.id !== matchId);
    lsSet(LS.matches, matches);

    let chats = ls<ChatMessageData[]>(LS.chat, []);
    chats = chats.filter(c => c.matchId !== matchId);
    lsSet(LS.chat, chats);

    let moves = ls<MatchMoveData[]>(LS.matchMoves, []);
    moves = moves.filter(m => m.matchId !== matchId);
    lsSet(LS.matchMoves, moves);

    // Supprimer de Supabase
    await safeDelete('matches', { id: matchId });
    await safeDelete('chat_messages', { match_id: matchId });
    await safeDelete('match_moves', { match_id: matchId });
  },

  async cleanAIMatches(): Promise<void> {
    // Supprimer tous les matchs IA du localStorage (ne devraient pas exister)
    let matches = ls<MatchData[]>(LS.matches, []);
    const aiMatchIds = matches.filter(m => m.mode === 'ai').map(m => m.id);
    if (aiMatchIds.length > 0) {
      matches = matches.filter(m => m.mode !== 'ai');
      lsSet(LS.matches, matches);
      let chats = ls<ChatMessageData[]>(LS.chat, []);
      chats = chats.filter(c => !aiMatchIds.includes(c.matchId));
      lsSet(LS.chat, chats);
    }

    // Supabase — silencieux si table absente
    await safeDelete('matches', { mode: 'ai' });
  },

  async getActiveByPlayer(playerId: string): Promise<MatchData[]> {
    if (tableStatus['matches'] !== false) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('status', 'active')
          .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`);
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map(dbRowToMatch);
          const localMatches = ls<MatchData[]>(LS.matches, []);
          const merged = [...mapped, ...localMatches.filter(l => !mapped.find(m => m.id === l.id))];
          lsSet(LS.matches, merged);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    const matches = ls<MatchData[]>(LS.matches, []);
    return matches.filter(m =>
      (m.player1Id === playerId || m.player2Id === playerId) && m.status === 'active'
    );
  },

  async getAllActive(limit = 50): Promise<MatchData[]> {
    if (tableStatus['matches'] !== false) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map(dbRowToMatch);
          const localMatches = ls<MatchData[]>(LS.matches, []);
          const merged = [...mapped, ...localMatches.filter((local) => !mapped.find((m) => m.id === local.id))];
          lsSet(LS.matches, merged);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    const matches = ls<MatchData[]>(LS.matches, []);
    return matches
      .filter((match) => match.status === 'active')
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, limit);
  },

  async getByMode(mode: MatchData['mode'], status?: MatchData['status'], limit = 100): Promise<MatchData[]> {
    if (tableStatus['matches'] !== false) {
      try {
        let query = supabase
          .from('matches')
          .select('*')
          .eq('mode', mode)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status) {
          query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map(dbRowToMatch);
          const localMatches = ls<MatchData[]>(LS.matches, []);
          const merged = [...mapped, ...localMatches.filter((local) => !mapped.find((m) => m.id === local.id))];
          lsSet(LS.matches, merged);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    const matches = ls<MatchData[]>(LS.matches, []);
    return matches
      .filter((match) => match.mode === mode && (status ? match.status === status : true))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, limit);
  },

  async realTimeSubscribe(matchId: string, callback: (match: MatchData) => void) {
    if (tableStatus['matches'] === false) return null;
    try {
      const channel = supabase
        .channel(`match:${matchId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'matches',
            filter: `id=eq.${matchId}`,
          },
          (payload) => {
            const mapped = dbRowToMatch(payload.new as Record<string, unknown>);
            const localMatches = ls<MatchData[]>(LS.matches, []);
            lsSet(LS.matches, [mapped, ...localMatches.filter((match) => match.id !== mapped.id)]);
            callback(mapped);
          },
        )
        .subscribe();
      return channel;
    } catch {
      return null;
    }
  },
};

export interface MatchMoveData {
  id: string;
  matchId: string;
  moveNumber: number;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  capturedPieces: Array<{ row: number; col: number }>;
  playerType: 'human' | 'ai';
  createdAt: string;
}

function dbRowToMatchMove(row: Record<string, unknown>): MatchMoveData {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    moveNumber: Number(row.move_number) || 1,
    fromRow: Number(row.from_row) || 0,
    fromCol: Number(row.from_col) || 0,
    toRow: Number(row.to_row) || 0,
    toCol: Number(row.to_col) || 0,
    capturedPieces: (row.captured_pieces as Array<{ row: number; col: number }> | null) ?? [],
    playerType: ((row.player_type as 'human' | 'ai') || 'human'),
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export const MatchMoveService = {
  async create(data: Omit<MatchMoveData, 'id' | 'createdAt'>): Promise<MatchMoveData> {
    const move: MatchMoveData = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      capturedPieces: data.capturedPieces ?? [],
    };

    if (tableStatus['match_moves'] !== false) {
      try {
        const { data: inserted, error } = await supabase
          .from('match_moves')
          .insert({
            id: move.id,
            match_id: move.matchId,
            move_number: move.moveNumber,
            from_row: move.fromRow,
            from_col: move.fromCol,
            to_row: move.toRow,
            to_col: move.toCol,
            captured_pieces: move.capturedPieces,
            player_type: move.playerType,
          })
          .select('*')
          .single();
        if (!error && inserted) {
          const mapped = dbRowToMatchMove(inserted as Record<string, unknown>);
          const localMoves = ls<MatchMoveData[]>(LS.matchMoves, []);
          lsSet(LS.matchMoves, [...localMoves, mapped]);
          return mapped;
        }
      } catch {
        // fallback local
      }
    }

    const localMoves = ls<MatchMoveData[]>(LS.matchMoves, []);
    lsSet(LS.matchMoves, [...localMoves, move]);
    return move;
  },

  async getByMatch(matchId: string): Promise<MatchMoveData[]> {
    if (tableStatus['match_moves'] !== false) {
      try {
        const { data, error } = await supabase
          .from('match_moves')
          .select('*')
          .eq('match_id', matchId)
          .order('move_number', { ascending: true });
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map(dbRowToMatchMove);
          const localMoves = ls<MatchMoveData[]>(LS.matchMoves, []);
          const merged = [...mapped, ...localMoves.filter((local) => !mapped.find((m) => m.id === local.id))];
          lsSet(LS.matchMoves, merged);
          return mapped;
        }
      } catch {
        // fallback local
      }
    }

    const localMoves = ls<MatchMoveData[]>(LS.matchMoves, []);
    return localMoves
      .filter((move) => move.matchId === matchId)
      .sort((a, b) => a.moveNumber - b.moveNumber);
  },

  async deleteByMatch(matchId: string): Promise<void> {
    const localMoves = ls<MatchMoveData[]>(LS.matchMoves, []);
    lsSet(LS.matchMoves, localMoves.filter((move) => move.matchId !== matchId));
    await safeDelete('match_moves', { match_id: matchId });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TRANSACTION OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface TransactionData {
  id: string;
  playerId: string;
  type: 'deposit' | 'withdraw' | 'win' | 'loss' | 'fee';
  amount: number;
  currency: 'CDF' | 'USD';
  description: string;
  status: 'pending' | 'completed' | 'failed';
  method: string | null;
  createdAt: string;
}

export const TransactionService = {

  async create(data: Omit<TransactionData, 'id' | 'createdAt'>): Promise<TransactionData> {
    const tx: TransactionData = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };

    const txs = ls<TransactionData[]>(LS.transactions, []);
    txs.unshift(tx);
    if (txs.length > 500) txs.splice(500);
    lsSet(LS.transactions, txs);

    await safeInsert('transactions', {
      id: tx.id,
      player_id: tx.playerId,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      description: tx.description,
      status: tx.status,
      method: tx.method,
    });

    return tx;
  },

  async getByPlayer(playerId: string, limit = 50): Promise<TransactionData[]> {
    const txs = ls<TransactionData[]>(LS.transactions, []);
    return txs.filter(t => t.playerId === playerId).slice(0, limit);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  NOTIFICATION OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface NotificationData {
  id: string;
  playerId: string;
  type: 'challenge' | 'win' | 'loss' | 'deposit' | 'withdraw' | 'chat' | 'system';
  title: string;
  message: string;
  read: boolean;
  fromPlayer: string | null;
  amount: number | null;
  matchId: string | null;
  createdAt: string;
}

function dbRowToNotification(row: Record<string, unknown>): NotificationData {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    type: row.type as NotificationData['type'],
    title: row.title as string,
    message: row.message as string,
    read: Boolean(row.read),
    fromPlayer: row.from_player as string | null,
    amount: row.amount !== null ? Number(row.amount) : null,
    matchId: row.match_id as string | null,
    createdAt: row.created_at as string,
  };
}

export const NotificationService = {

  async create(data: Omit<NotificationData, 'id' | 'createdAt' | 'read'>): Promise<NotificationData> {
    const notif: NotificationData = {
      ...data, id: uuidv4(), read: false, createdAt: new Date().toISOString(),
    };

    const notifs = ls<NotificationData[]>(LS.notifications, []);
    notifs.unshift(notif);
    if (notifs.length > 200) notifs.splice(200);
    lsSet(LS.notifications, notifs);

    await safeInsert('notifications', {
      id: notif.id,
      player_id: notif.playerId,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      read: false,
      from_player: notif.fromPlayer,
      amount: notif.amount,
      match_id: notif.matchId,
    });

    return notif;
  },

  async getByPlayer(playerId: string): Promise<NotificationData[]> {
    const notifs = ls<NotificationData[]>(LS.notifications, []);
    return notifs.filter(n => n.playerId === playerId);
  },

  async markAllRead(playerId: string): Promise<void> {
    const notifs = ls<NotificationData[]>(LS.notifications, []);
    notifs.forEach(n => { if (n.playerId === playerId) n.read = true; });
    lsSet(LS.notifications, notifs);
    // Supabase en arrière-plan (silencieux)
    if (tableStatus['notifications'] !== false) {
      try {
        await supabase.from('notifications').update({ read: true }).eq('player_id', playerId);
      } catch { /* silencieux */ }
    }
  },

  async realTimeSubscribe(playerId: string, callback: (notif: NotificationData) => void) {
    if (tableStatus['notifications'] === false) return null;
    try {
      const channel = supabase
        .channel(`notifications:${playerId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `player_id=eq.${playerId}`,
        }, (payload) => {
          callback(dbRowToNotification(payload.new as Record<string, unknown>));
        })
        .subscribe();
      return channel;
    } catch {
      return null;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CHALLENGE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChallengeData {
  id: string;
  fromPlayerId: string;
  toPlayerId: string | null;
  acceptedByPlayerId: string | null;
  fromPlayerName: string;
  betAmount: number;
  currency: 'CDF' | 'USD';
  pieceCount: number;
  boardSize: number;
  timePerTurn: number;
  status: 'open' | 'accepted' | 'cancelled' | 'expired';
  gameId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  createdAt: string;
}

function dbRowToChallenge(row: Record<string, unknown>): ChallengeData {
  const createdAt = (row.created_at as string) || new Date().toISOString();
  const fallbackExpiresAt = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    id: row.id as string,
    fromPlayerId: row.from_player_id as string,
    toPlayerId: (row.to_player_id as string | null) ?? null,
    acceptedByPlayerId: (row.accepted_by_player_id as string | null) ?? null,
    fromPlayerName: (row.from_player_name as string) || '',
    betAmount: Number(row.bet_amount) || 0,
    currency: ((row.currency as 'CDF' | 'USD') || 'CDF'),
    pieceCount: Number(row.piece_count) || 12,
    boardSize: Number(row.board_size) || 10,
    timePerTurn: Number(row.time_per_turn) || 60,
    status: ((row.status as ChallengeData['status']) || 'open'),
    gameId: (row.game_id as string | null) ?? null,
    expiresAt: (row.expires_at as string) || fallbackExpiresAt,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    expiredAt: (row.expired_at as string | null) ?? null,
    createdAt,
  };
}

function upsertLocalChallenge(challenge: ChallengeData): void {
  const local = ls<ChallengeData[]>(LS.challenges, []);
  const idx = local.findIndex(c => c.id === challenge.id);
  if (idx >= 0) local[idx] = challenge;
  else local.unshift(challenge);
  lsSet(LS.challenges, local);
}

export const ChallengeService = {

  async create(
    data: Omit<ChallengeData, 'id' | 'createdAt' | 'status' | 'gameId' | 'acceptedByPlayerId' | 'expiresAt' | 'acceptedAt' | 'cancelledAt' | 'expiredAt'>
  ): Promise<ChallengeData> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const challenge: ChallengeData = {
      ...data,
      id: uuidv4(),
      status: 'open',
      gameId: null,
      acceptedByPlayerId: null,
      expiresAt,
      acceptedAt: null,
      cancelledAt: null,
      expiredAt: null,
      createdAt: new Date().toISOString(),
    };

    if (tableStatus['challenges'] !== false) {
      try {
        const { data: inserted, error } = await supabase
          .from('challenges')
          .insert({
            id: challenge.id,
            from_player_id: challenge.fromPlayerId,
            to_player_id: challenge.toPlayerId,
            from_player_name: challenge.fromPlayerName,
            bet_amount: challenge.betAmount,
            currency: challenge.currency,
            piece_count: challenge.pieceCount,
            board_size: challenge.boardSize,
            time_per_turn: challenge.timePerTurn,
            status: 'open',
            expires_at: challenge.expiresAt,
          })
          .select('*')
          .single();
        if (!error && inserted) {
          const mapped = dbRowToChallenge(inserted as Record<string, unknown>);
          upsertLocalChallenge(mapped);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    upsertLocalChallenge(challenge);
    return challenge;
  },

  async expireChallenges(): Promise<number> {
    let expiredCount = 0;
    if (tableStatus['challenges'] !== false) {
      try {
        const { data, error } = await supabase.rpc('expire_challenges');
        if (!error) expiredCount = Number(data) || 0;
      } catch {
        // silencieux
      }
    }

    const now = Date.now();
    const local = ls<ChallengeData[]>(LS.challenges, []);
    let changed = false;
    const updated = local.map((challenge) => {
      if (challenge.status !== 'open') return challenge;
      const expiresAtMs = new Date(challenge.expiresAt).getTime();
      if (!Number.isNaN(expiresAtMs) && expiresAtMs <= now) {
        changed = true;
        return { ...challenge, status: 'expired' as const, expiredAt: new Date().toISOString() };
      }
      return challenge;
    });
    if (changed) lsSet(LS.challenges, updated);
    return expiredCount;
  },

  async getById(id: string): Promise<ChallengeData | null> {
    if (tableStatus['challenges'] !== false) {
      try {
        const { data, error } = await supabase
          .from('challenges')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) {
          const mapped = dbRowToChallenge(data as Record<string, unknown>);
          upsertLocalChallenge(mapped);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }
    const local = ls<ChallengeData[]>(LS.challenges, []);
    return local.find(c => c.id === id) || null;
  },

  async getByPlayer(playerId: string): Promise<ChallengeData[]> {
    await ChallengeService.expireChallenges();
    if (tableStatus['challenges'] !== false) {
      try {
        const { data, error } = await supabase
          .from('challenges')
          .select('*')
          .or(`from_player_id.eq.${playerId},to_player_id.eq.${playerId}`)
          .order('created_at', { ascending: false });
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map(dbRowToChallenge);
          mapped.forEach(upsertLocalChallenge);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    const local = ls<ChallengeData[]>(LS.challenges, []);
    return local
      .filter(c => c.fromPlayerId === playerId || c.toPlayerId === playerId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },

  async getOpenChallenges(playerId: string): Promise<ChallengeData[]> {
    await ChallengeService.expireChallenges();
    if (tableStatus['challenges'] !== false) {
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('challenges')
          .select('*')
          .eq('status', 'open')
          .gt('expires_at', nowIso)
          .neq('from_player_id', playerId)
          .or(`to_player_id.is.null,to_player_id.eq.${playerId}`)
          .order('bet_amount', { ascending: false });
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map(dbRowToChallenge);
          mapped.forEach(upsertLocalChallenge);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    const now = Date.now();
    const local = ls<ChallengeData[]>(LS.challenges, []);
    return local
      .filter(c =>
        c.status === 'open' &&
        c.fromPlayerId !== playerId &&
        (c.toPlayerId === null || c.toPlayerId === playerId) &&
        new Date(c.expiresAt).getTime() > now
      )
      .sort((a, b) => b.betAmount - a.betAmount);
  },

  async acceptAtomic(challengeId: string, acceptorId: string): Promise<{ challenge: ChallengeData; game: MatchData }> {
    if (tableStatus['challenges'] !== false && tableStatus['matches'] !== false) {
      try {
        const { data, error } = await supabase.rpc('accept_challenge_atomic', {
          p_challenge_id: challengeId,
          p_acceptor_id: acceptorId,
        });
        if (error) throw error;
        const payload = data as { challenge: Record<string, unknown>; game: Record<string, unknown> } | null;
        if (payload?.challenge && payload?.game) {
          const challenge = dbRowToChallenge(payload.challenge);
          const game = dbRowToMatch(payload.game);
          upsertLocalChallenge(challenge);
          const localMatches = ls<MatchData[]>(LS.matches, []);
          lsSet(LS.matches, [game, ...localMatches.filter(m => m.id !== game.id)]);
          return { challenge, game };
        }
      } catch {
        // fallback local
      }
    }

    const local = ls<ChallengeData[]>(LS.challenges, []);
    const idx = local.findIndex(c => c.id === challengeId);
    if (idx < 0) throw new Error('Défi introuvable.');
    const current = local[idx];
    if (current.status !== 'open') throw new Error('Ce défi n’est plus disponible.');
    if (new Date(current.expiresAt).getTime() <= Date.now()) throw new Error('Ce défi a expiré.');
    if (current.toPlayerId && current.toPlayerId !== acceptorId) throw new Error('Ce défi est réservé à un autre joueur.');

    const gameId = uuidv4();
    const updatedChallenge: ChallengeData = {
      ...current,
      status: 'accepted',
      acceptedByPlayerId: acceptorId,
      acceptedAt: new Date().toISOString(),
      gameId,
    };
    local[idx] = updatedChallenge;
    lsSet(LS.challenges, local);

    const game: MatchData = {
      id: gameId,
      player1Id: current.fromPlayerId,
      player2Id: acceptorId,
      challengeId: current.id,
      mode: 'challenge',
      status: 'active',
      winnerId: null,
      betAmount: current.betAmount,
      currency: current.currency,
      boardSize: current.boardSize,
      pieceCount: current.pieceCount,
      timePerTurn: current.timePerTurn,
      consecutiveDraws: 0,
      boardState: '',
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    const localMatches = ls<MatchData[]>(LS.matches, []);
    lsSet(LS.matches, [game, ...localMatches.filter(m => m.id !== game.id)]);

    return { challenge: updatedChallenge, game };
  },

  async cancel(challengeId: string, requesterId: string): Promise<ChallengeData | null> {
    if (tableStatus['challenges'] !== false) {
      try {
        const { data, error } = await supabase.rpc('cancel_challenge', {
          p_challenge_id: challengeId,
          p_requester_id: requesterId,
        });
        if (!error && data) {
          const challenge = dbRowToChallenge(data as Record<string, unknown>);
          upsertLocalChallenge(challenge);
          return challenge;
        }
      } catch {
        // fallback local
      }
    }

    const local = ls<ChallengeData[]>(LS.challenges, []);
    const idx = local.findIndex(c => c.id === challengeId);
    if (idx < 0) return null;
    if (local[idx].status !== 'open') return local[idx];
    local[idx] = { ...local[idx], status: 'cancelled', cancelledAt: new Date().toISOString() };
    lsSet(LS.challenges, local);
    return local[idx];
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CHAT MESSAGE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChatMessageData {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

export const ChatService = {

  async create(data: Omit<ChatMessageData, 'id' | 'createdAt'>): Promise<ChatMessageData> {
    const msg: ChatMessageData = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };

    if (tableStatus['chat_messages'] !== false) {
      try {
        const { data: inserted, error } = await supabase
          .from('chat_messages')
          .insert({
            id: msg.id,
            match_id: msg.matchId,
            sender_id: msg.senderId,
            sender_name: msg.senderName,
            content: msg.content,
          })
          .select('*')
          .single();
        if (error) {
          throw new Error(error.message || 'Le message ne peut pas être envoyé.');
        }
        if (inserted) {
          msg.id = inserted.id as string;
          msg.createdAt = (inserted.created_at as string) || msg.createdAt;
          tableStatus['chat_messages'] = true;
        }
      } catch (error) {
        const e = error as { message?: string };
        throw new Error(e.message || 'Le message ne peut pas être envoyé.');
      }
    }

    const chats = ls<ChatMessageData[]>(LS.chat, []);
    chats.push(msg);
    if (chats.length > 1000) chats.splice(0, chats.length - 1000);
    lsSet(LS.chat, chats);
    return msg;
  },

  async getByMatch(matchId: string): Promise<ChatMessageData[]> {
    if (tableStatus['chat_messages'] !== false) {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true });
        if (!error && data) {
          const mapped = (data as Record<string, unknown>[]).map((row) => ({
            id: row.id as string,
            matchId: row.match_id as string,
            senderId: row.sender_id as string,
            senderName: row.sender_name as string,
            content: row.content as string,
            createdAt: row.created_at as string,
          }));
          const local = ls<ChatMessageData[]>(LS.chat, []);
          const merged = [...mapped, ...local.filter(l => !mapped.find(m => m.id === l.id))];
          lsSet(LS.chat, merged);
          return mapped;
        }
      } catch {
        // silencieux
      }
    }

    const chats = ls<ChatMessageData[]>(LS.chat, []);
    return chats.filter(c => c.matchId === matchId);
  },

  async deleteByMatch(matchId: string): Promise<void> {
    let chats = ls<ChatMessageData[]>(LS.chat, []);
    chats = chats.filter(c => c.matchId !== matchId);
    lsSet(LS.chat, chats);
    await safeDelete('chat_messages', { match_id: matchId });
  },

  async realTimeSubscribe(matchId: string, callback: (msg: ChatMessageData) => void) {
    if (tableStatus['chat_messages'] === false) return null;
    try {
      const channel = supabase
        .channel(`chat:${matchId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `match_id=eq.${matchId}`,
        }, (payload) => {
          const r = payload.new as Record<string, unknown>;
          callback({
            id: r.id as string,
            matchId: r.match_id as string,
            senderId: r.sender_id as string,
            senderName: r.sender_name as string,
            content: r.content as string,
            createdAt: r.created_at as string,
          });
        })
        .subscribe();
      return channel;
    } catch {
      return null;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN WALLET
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdminWalletData {
  balanceCDF: number;
  balanceUSD: number;
  totalFeesCollectedCDF: number;
  totalFeesCollectedUSD: number;
  lastUpdated: string;
}

export interface AdminWalletTransaction {
  id: string;
  type: 'fee_in' | 'deposit' | 'withdraw';
  amount: number;
  currency: 'CDF' | 'USD';
  description: string;
  matchId?: string;
  createdAt: string;
}

const LS_ADMIN_WALLET = 'dames_admin_wallet';
const LS_ADMIN_WALLET_TXS = 'dames_admin_wallet_txs';

const DEFAULT_ADMIN_WALLET: AdminWalletData = {
  balanceCDF: 0,
  balanceUSD: 0,
  totalFeesCollectedCDF: 0,
  totalFeesCollectedUSD: 0,
  lastUpdated: new Date().toISOString(),
};

export const AdminWalletService = {
  getWallet(): AdminWalletData {
    return ls<AdminWalletData>(LS_ADMIN_WALLET, DEFAULT_ADMIN_WALLET);
  },

  saveWallet(wallet: AdminWalletData): void {
    wallet.lastUpdated = new Date().toISOString();
    lsSet(LS_ADMIN_WALLET, wallet);
  },

  async collectFee(amount: number, currency: 'CDF' | 'USD', matchId?: string): Promise<void> {
    const wallet = AdminWalletService.getWallet();
    if (currency === 'CDF') {
      wallet.balanceCDF += amount;
      wallet.totalFeesCollectedCDF += amount;
    } else {
      wallet.balanceUSD += amount;
      wallet.totalFeesCollectedUSD += amount;
    }
    AdminWalletService.saveWallet(wallet);

    const tx: AdminWalletTransaction = {
      id: uuidv4(),
      type: 'fee_in',
      amount,
      currency,
      description: `Commission 2% — Match ${matchId ? matchId.slice(0, 8) : ''}`,
      matchId,
      createdAt: new Date().toISOString(),
    };
    const txs = ls<AdminWalletTransaction[]>(LS_ADMIN_WALLET_TXS, []);
    txs.unshift(tx);
    if (txs.length > 500) txs.splice(500);
    lsSet(LS_ADMIN_WALLET_TXS, txs);

    // Supabase silencieux
    await safeInsert('admin_wallet_transactions', {
      id: tx.id, type: tx.type, amount, currency,
      description: tx.description, match_id: matchId || null,
    });
    await safeUpsert('admin_wallet', {
      id: 'main',
      balance_cdf: wallet.balanceCDF,
      balance_usd: wallet.balanceUSD,
      total_fees_cdf: wallet.totalFeesCollectedCDF,
      total_fees_usd: wallet.totalFeesCollectedUSD,
      updated_at: wallet.lastUpdated,
    }, 'id');
  },

  async adminDeposit(amount: number, currency: 'CDF' | 'USD', description: string): Promise<void> {
    const wallet = AdminWalletService.getWallet();
    if (currency === 'CDF') wallet.balanceCDF += amount;
    else wallet.balanceUSD += amount;
    AdminWalletService.saveWallet(wallet);

    const tx: AdminWalletTransaction = {
      id: uuidv4(), type: 'deposit', amount, currency,
      description: description || 'Dépôt administrateur',
      createdAt: new Date().toISOString(),
    };
    const txs = ls<AdminWalletTransaction[]>(LS_ADMIN_WALLET_TXS, []);
    txs.unshift(tx);
    lsSet(LS_ADMIN_WALLET_TXS, txs);

    await safeInsert('admin_wallet_transactions', {
      id: tx.id, type: tx.type, amount, currency, description: tx.description,
    });
    await safeUpsert('admin_wallet', {
      id: 'main', balance_cdf: wallet.balanceCDF, balance_usd: wallet.balanceUSD,
      total_fees_cdf: wallet.totalFeesCollectedCDF, total_fees_usd: wallet.totalFeesCollectedUSD,
      updated_at: wallet.lastUpdated,
    }, 'id');
  },

  async adminWithdraw(amount: number, currency: 'CDF' | 'USD', description: string): Promise<boolean> {
    const wallet = AdminWalletService.getWallet();
    if (currency === 'CDF' && wallet.balanceCDF < amount) return false;
    if (currency === 'USD' && wallet.balanceUSD < amount) return false;
    if (currency === 'CDF') wallet.balanceCDF -= amount;
    else wallet.balanceUSD -= amount;
    AdminWalletService.saveWallet(wallet);

    const tx: AdminWalletTransaction = {
      id: uuidv4(), type: 'withdraw', amount: -amount, currency,
      description: description || 'Retrait administrateur',
      createdAt: new Date().toISOString(),
    };
    const txs = ls<AdminWalletTransaction[]>(LS_ADMIN_WALLET_TXS, []);
    txs.unshift(tx);
    lsSet(LS_ADMIN_WALLET_TXS, txs);

    await safeInsert('admin_wallet_transactions', {
      id: tx.id, type: tx.type, amount: -amount, currency, description: tx.description,
    });
    await safeUpsert('admin_wallet', {
      id: 'main', balance_cdf: wallet.balanceCDF, balance_usd: wallet.balanceUSD,
      total_fees_cdf: wallet.totalFeesCollectedCDF, total_fees_usd: wallet.totalFeesCollectedUSD,
      updated_at: wallet.lastUpdated,
    }, 'id');
    return true;
  },

  getTransactions(): AdminWalletTransaction[] {
    return ls<AdminWalletTransaction[]>(LS_ADMIN_WALLET_TXS, []);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdminSettingsData {
  id: string;
  aiMatchTime: number;
  challengeMatchTime: number;
  platformFee: number;
  maxBet: number;
  minBet: number;
  cdfRate: number;
  usdRate: number;
  defaultCurrency: 'CDF' | 'USD';
}

const DEFAULT_SETTINGS: AdminSettingsData = {
  id: 'global',
  aiMatchTime: 30,
  challengeMatchTime: 60,
  platformFee: 2,
  maxBet: 500000,
  minBet: 500,
  cdfRate: 2800,
  usdRate: 1,
  defaultCurrency: 'CDF',
};

export const AdminService = {

  async getSettings(): Promise<AdminSettingsData> {
    return ls<AdminSettingsData>(LS.settings, DEFAULT_SETTINGS);
  },

  async updateSettings(updates: Partial<AdminSettingsData>): Promise<void> {
    const current = ls<AdminSettingsData>(LS.settings, DEFAULT_SETTINGS);
    const newSettings = { ...current, ...updates };
    lsSet(LS.settings, newSettings);

    await safeUpsert('admin_settings', {
      id: 'global',
      ai_match_time: newSettings.aiMatchTime,
      challenge_match_time: newSettings.challengeMatchTime,
      platform_fee: newSettings.platformFee,
      max_bet: newSettings.maxBet,
      min_bet: newSettings.minBet,
      cdf_rate: newSettings.cdfRate,
      usd_rate: newSettings.usdRate,
      default_currency: newSettings.defaultCurrency,
      updated_at: new Date().toISOString(),
    }, 'id');
  },

  async getAllPlayers(): Promise<PlayerData[]> {
    return ls<PlayerData[]>(LS.players, getDefaultPlayers());
  },

  async deletePlayer(id: string): Promise<void> {
    let players = ls<PlayerData[]>(LS.players, []);
    players = players.filter(p => p.id !== id);
    lsSet(LS.players, players);
    await safeDelete('players', { id });
  },

  async getAllTransactions(): Promise<TransactionData[]> {
    return ls<TransactionData[]>(LS.transactions, []);
  },

  async updatePlayerField(id: string, field: keyof PlayerData, value: unknown): Promise<void> {
    const players = ls<PlayerData[]>(LS.players, []);
    const idx = players.findIndex(p => p.id === id);
    if (idx >= 0) {
      (players[idx] as unknown as Record<string, unknown>)[field as string] = value;
      lsSet(LS.players, players);
    }

    const dbField: Record<string, string> = {
      isOnline: 'is_online',
      balance: 'balance',
      totalWins: 'total_wins',
      totalLosses: 'total_losses',
      totalDraws: 'total_draws',
      totalEarnings: 'total_earnings',
      preferredCurrency: 'preferred_currency',
      role: 'role',
      firstName: 'first_name',
      lastName: 'last_name',
      phone: 'phone',
      email: 'email',
      avatar: 'avatar',
    };
    const key = dbField[field as string] || field as string;
    await safeUpdate('players', { [key]: value, updated_at: new Date().toISOString() }, { id });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PASSWORD HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function hashPassword(password: string): string {
  return btoa(password + ':dames_v1_salt');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DEFAULT SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════

function getDefaultPlayers(): PlayerData[] {
  const existing = localStorage.getItem(LS.players);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as PlayerData[];
      let migrated = false;
      parsed.forEach(p => {
        if (p.virtualBalanceCDF === undefined) { p.virtualBalanceCDF = 54000; migrated = true; }
        if (p.virtualBalanceUSD === undefined) { p.virtualBalanceUSD = 200; migrated = true; }
      });
      if (migrated) lsSet(LS.players, parsed);
      return parsed;
    } catch { /* */ }
  }

  const vb = { virtualBalanceCDF: 54000, virtualBalanceUSD: 200 };
  const defaults: PlayerData[] = [
    {
      id: 'demo-001', firstName: 'Mamadou', lastName: 'Diallo',
      phone: '+243820000000', email: 'demo@dames.com',
      passwordHash: hashPassword('demo123'),
      balance: 250000, ...vb,
      totalWins: 23, totalLosses: 8, totalDraws: 3, totalEarnings: 125000,
      avatar: '👑', isOnline: true, preferredCurrency: 'CDF', role: 'player',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'admin-001', firstName: 'Admin', lastName: 'Système',
      phone: '+243000000000', email: 'admin@dames.com',
      passwordHash: hashPassword('admin2024'),
      balance: 0, virtualBalanceCDF: 0, virtualBalanceUSD: 0,
      totalWins: 0, totalLosses: 0, totalDraws: 0, totalEarnings: 0,
      avatar: '⚙️', isOnline: false, preferredCurrency: 'CDF', role: 'admin',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'p-002', firstName: 'Kofi', lastName: 'Mensah',
      phone: '+233200000000', email: 'kofi@dames.com',
      passwordHash: hashPassword('kofi123'),
      balance: 180000, ...vb,
      totalWins: 145, totalLosses: 42, totalDraws: 12, totalEarnings: 520000,
      avatar: '🦁', isOnline: true, preferredCurrency: 'CDF', role: 'player',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'p-003', firstName: 'Amara', lastName: 'Diallo',
      phone: '+224620000000', email: 'amara@dames.com',
      passwordHash: hashPassword('amara123'),
      balance: 95000, ...vb,
      totalWins: 132, totalLosses: 55, totalDraws: 8, totalEarnings: 480000,
      avatar: '🐯', isOnline: true, preferredCurrency: 'USD', role: 'player',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'p-004', firstName: 'Fatou', lastName: 'Camara',
      phone: '+221770000000', email: 'fatou@dames.com',
      passwordHash: hashPassword('fatou123'),
      balance: 62000, ...vb,
      totalWins: 118, totalLosses: 67, totalDraws: 15, totalEarnings: 420000,
      avatar: '🦅', isOnline: false, preferredCurrency: 'CDF', role: 'player',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'p-005', firstName: 'Kwame', lastName: 'Asante',
      phone: '+233244000000', email: 'kwame@dames.com',
      passwordHash: hashPassword('kwame123'),
      balance: 44000, ...vb,
      totalWins: 97, totalLosses: 78, totalDraws: 21, totalEarnings: 350000,
      avatar: '🦊', isOnline: true, preferredCurrency: 'CDF', role: 'player',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'p-006', firstName: 'Aisha', lastName: 'Traore',
      phone: '+223760000000', email: 'aisha@dames.com',
      passwordHash: hashPassword('aisha123'),
      balance: 38000, ...vb,
      totalWins: 89, totalLosses: 91, totalDraws: 9, totalEarnings: 310000,
      avatar: '🐆', isOnline: true, preferredCurrency: 'USD', role: 'player',
      createdAt: new Date().toISOString(),
    },
  ];

  lsSet(LS.players, defaults);
  return defaults;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SUB-ADMIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface SubAdminData {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'super' | 'moderator' | 'support';
  permissions: {
    canManagePlayers: boolean;
    canManageWallet: boolean;
    canViewStats: boolean;
    canManageChallenges: boolean;
    canChangeSettings: boolean;
  };
  isActive: boolean;
  createdAt: string;
  lastLogin: string | null;
}

const LS_SUB_ADMINS = 'dames_sub_admins';
const LS_SUPER_ADMIN_PW = 'dames_super_admin_password';
const DEFAULT_SUPER_ADMIN_PW = '1234';

export const SubAdminService = {
  getSuperAdminPassword(): string {
    return localStorage.getItem(LS_SUPER_ADMIN_PW) || DEFAULT_SUPER_ADMIN_PW;
  },
  setSuperAdminPassword(pw: string): void {
    localStorage.setItem(LS_SUPER_ADMIN_PW, pw);
  },
  verifySuperAdminPassword(pw: string): boolean {
    return pw === SubAdminService.getSuperAdminPassword();
  },
  getAll(): SubAdminData[] {
    return ls<SubAdminData[]>(LS_SUB_ADMINS, []);
  },
  create(data: Omit<SubAdminData, 'id' | 'createdAt' | 'lastLogin'>): SubAdminData {
    const subAdmin: SubAdminData = {
      ...data, id: uuidv4(), createdAt: new Date().toISOString(), lastLogin: null,
    };
    const list = SubAdminService.getAll();
    list.unshift(subAdmin);
    lsSet(LS_SUB_ADMINS, list);
    return subAdmin;
  },
  update(id: string, updates: Partial<SubAdminData>): void {
    const list = SubAdminService.getAll();
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...updates }; lsSet(LS_SUB_ADMINS, list); }
  },
  delete(id: string): void {
    const list = SubAdminService.getAll().filter(a => a.id !== id);
    lsSet(LS_SUB_ADMINS, list);
  },
  verifyAccess(password: string): SubAdminData | null {
    const adminPw = localStorage.getItem('dames_admin_password') || '123';
    if (password === adminPw) return null;
    const list = SubAdminService.getAll();
    return list.find(a => a.password === password && a.isActive) || null;
  },
  recordLogin(id: string): void {
    SubAdminService.update(id, { lastLogin: new Date().toISOString() });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTO-INIT — Vérification silencieuse de Supabase
// ═══════════════════════════════════════════════════════════════════════════════

export async function autoInitSupabase(): Promise<void> {
  try {
    // Test de connexion rapide avec timeout
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const queryPromise = supabase.from('players').select('id').limit(1);

    const result = await Promise.race([queryPromise, timeoutPromise]);

    if (!result) {
      // Timeout
      supabaseReady = false;
      supabaseChecked = true;
      console.info('[DB] Mode localStorage activé (timeout Supabase)');
      return;
    }

    const { error } = result as { data: unknown; error: { message: string; code?: string } | null };

    if (error) {
      const msg = error.message || '';
      const code = error.code || '';

      if (
        code === '42P01' ||
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('406') ||
        msg.includes('400')
      ) {
        // Tables absentes — mode localStorage
        supabaseReady = false;
        supabaseChecked = true;
        // Marquer toutes les tables comme absentes
        Object.keys(tableStatus).forEach(k => { tableStatus[k] = false; });
        console.info('[DB] Tables Supabase non créées → mode localStorage 100%');
        console.info('[DB] Pour activer Supabase, exécutez schema.sql dans:');
        console.info('[DB] https://app.supabase.com/project/odaksyrfoujnpzzoetew/sql');
        return;
      }

      // Autre erreur (auth, réseau...)
      supabaseReady = false;
      supabaseChecked = true;
      console.info('[DB] Mode localStorage activé');
      return;
    }

    // ✅ Supabase disponible !
    supabaseReady = true;
    supabaseChecked = true;
    tableStatus['players'] = true;
    console.info('[DB] ✅ Supabase connecté et opérationnel');

    // Synchronisation bidirectionnelle
    await syncData();

  } catch {
    supabaseReady = false;
    supabaseChecked = true;
    console.info('[DB] Mode localStorage activé (erreur réseau)');
  }
}

async function syncData(): Promise<void> {
  try {
    // Vérifier si Supabase a des joueurs
    const { data: existingPlayers, error } = await supabase
      .from('players').select('id').limit(1);

    if (error) return;

    if (!existingPlayers || existingPlayers.length === 0) {
      // Supabase vide → pousser données locales
      const localPlayers = ls<PlayerData[]>(LS.players, []);
      if (localPlayers.length > 0) {
        for (const p of localPlayers) {
          await safeUpsert('players', {
            id: p.id, first_name: p.firstName, last_name: p.lastName,
            phone: p.phone, email: p.email, password_hash: p.passwordHash,
            balance: p.balance,
            virtual_balance_cdf: p.virtualBalanceCDF ?? 54000,
            virtual_balance_usd: p.virtualBalanceUSD ?? 200,
            total_wins: p.totalWins, total_losses: p.totalLosses,
            total_draws: p.totalDraws, total_earnings: p.totalEarnings,
            avatar: p.avatar, is_online: false,
            preferred_currency: p.preferredCurrency, role: p.role,
          }, 'id');
        }
        console.info(`[DB] ${localPlayers.length} joueurs synchronisés → Supabase`);
      }
    } else {
      // Supabase a des données → tirer vers localStorage
      const { data: dbPlayers } = await supabase.from('players').select('*');
      if (dbPlayers && dbPlayers.length > 0) {
        const mapped = dbPlayers.map(r => dbRowToPlayer(r as Record<string, unknown>));
        lsSet(LS.players, mapped);
        console.info(`[DB] ${dbPlayers.length} joueurs chargés depuis Supabase`);
      }
    }

    // Nettoyer les matchs IA éventuels
    await safeDelete('matches', { mode: 'ai' });

    // Init admin_settings si absent
    const { data: settingsCheck } = await supabase
      .from('admin_settings').select('id').eq('id', 'global').limit(1);
    if (!settingsCheck || settingsCheck.length === 0) {
      const localSettings = ls<AdminSettingsData>(LS.settings, DEFAULT_SETTINGS);
      await safeInsert('admin_settings', {
        id: 'global',
        ai_match_time: localSettings.aiMatchTime,
        challenge_match_time: localSettings.challengeMatchTime,
        platform_fee: localSettings.platformFee,
        max_bet: localSettings.maxBet,
        min_bet: localSettings.minBet,
        cdf_rate: localSettings.cdfRate,
        usd_rate: localSettings.usdRate,
        default_currency: localSettings.defaultCurrency,
      });
    }

    // Init admin_wallet si absent
    const { data: walletCheck } = await supabase
      .from('admin_wallet').select('id').eq('id', 'main').limit(1);
    if (!walletCheck || walletCheck.length === 0) {
      const localWallet = ls<AdminWalletData>(LS_ADMIN_WALLET, DEFAULT_ADMIN_WALLET);
      await safeInsert('admin_wallet', {
        id: 'main',
        balance_cdf: localWallet.balanceCDF,
        balance_usd: localWallet.balanceUSD,
        total_fees_cdf: localWallet.totalFeesCollectedCDF,
        total_fees_usd: localWallet.totalFeesCollectedUSD,
      });
    } else {
      // Sync wallet admin depuis Supabase
      const { data: walletData } = await supabase
        .from('admin_wallet').select('*').eq('id', 'main').single();
      if (walletData) {
        const wallet: AdminWalletData = {
          balanceCDF: Number(walletData.balance_cdf),
          balanceUSD: Number(walletData.balance_usd),
          totalFeesCollectedCDF: Number(walletData.total_fees_cdf),
          totalFeesCollectedUSD: Number(walletData.total_fees_usd),
          lastUpdated: walletData.updated_at,
        };
        lsSet(LS_ADMIN_WALLET, wallet);
      }
    }

  } catch (err) {
    console.debug('[DB] Sync partielle:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INITIALIZE LOCAL DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

export function initializeDatabase(): void {
  getDefaultPlayers();
  const settings = ls<AdminSettingsData | null>(LS.settings, null);
  if (!settings) lsSet(LS.settings, DEFAULT_SETTINGS);

  // Supprimer tous les matchs IA résiduels
  let matches = ls<MatchData[]>(LS.matches, []);
  const aiIds = matches.filter(m => m.mode === 'ai').map(m => m.id);
  if (aiIds.length > 0) {
    matches = matches.filter(m => m.mode !== 'ai');
    lsSet(LS.matches, matches);
    let chats = ls<ChatMessageData[]>(LS.chat, []);
    chats = chats.filter(c => !aiIds.includes(c.matchId));
    lsSet(LS.chat, chats);
  }
}
