/**
 * SUPABASE REALTIME SERVICE — JEUX DE DAMES AFRICAINES
 * ─────────────────────────────────────────────────────────────────────────────
 * Gère toutes les subscriptions temps réel :
 *   - Synchronisation des coups de jeu (match_moves)
 *   - Chat entre joueurs (chat_messages)
 *   - Notifications en temps réel (notifications)
 *   - Présence des joueurs en ligne (presence)
 *   - Statut des défis (challenges)
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RealtimeMove {
  matchId: string;
  playerId: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  capturedPieces?: { row: number; col: number }[];
  timestamp: string;
  // ── Champs anti-triche (moveValidator) ──
  nonce?: string;       // Identifiant unique du coup (anti-replay)
  boardHash?: string;   // Hash du plateau avant le coup
  signature?: string;   // Signature HMAC du coup
}

export interface RealtimeChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface RealtimeNotification {
  id: string;
  playerId: string;
  type: string;
  title: string;
  message: string;
  fromPlayer: string | null;
  amount: number | null;
  matchId: string | null;
  createdAt: string;
}

export interface RealtimePresence {
  playerId: string;
  playerName: string;
  isOnline: boolean;
  currentMatch: string | null;
}

export interface RealtimeChallengeUpdate {
  challengeId: string;
  status: 'open' | 'accepted' | 'cancelled' | 'expired';
  fromPlayerId: string;
  toPlayerId: string | null;
  gameId?: string | null;
}

// ─── Channel Registry ─────────────────────────────────────────────────────────
// Garde en mémoire tous les channels actifs pour éviter les fuites mémoire

const activeChannels: Map<string, RealtimeChannel> = new Map();

function unsubscribe(key: string): void {
  const ch = activeChannels.get(key);
  if (ch) {
    supabase.removeChannel(ch);
    activeChannels.delete(key);
  }
}

function registerChannel(key: string, channel: RealtimeChannel): RealtimeChannel {
  unsubscribe(key); // Nettoyer l'ancien si existant
  activeChannels.set(key, channel);
  return channel;
}

// ─── Realtime Status ──────────────────────────────────────────────────────────

let realtimeEnabled = false;
let realtimeChecked = false;

export async function checkRealtimeAvailability(): Promise<boolean> {
  if (realtimeChecked) return realtimeEnabled;
  try {
    const testChannel = supabase.channel('test_connection');
    const result = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 4000);

      testChannel.subscribe((status) => {
        clearTimeout(timeout);
        if (status === 'SUBSCRIBED') {
          resolve(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          resolve(false);
        }
      });
    });
    supabase.removeChannel(testChannel);
    realtimeEnabled = result;
    realtimeChecked = true;
    console.info(`[Realtime] ${realtimeEnabled ? '✅ Activé' : '❌ Indisponible — mode local'}`);
    return realtimeEnabled;
  } catch {
    realtimeEnabled = false;
    realtimeChecked = true;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  1. SUBSCRIPTION MATCH — Coups de jeu en temps réel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * S'abonner aux coups de jeu d'un match (Supabase Broadcast)
 * Utilise un canal dédié par match pour les coups
 */
export function subscribeToMatchMoves(
  matchId: string,
  playerId: string,
  onMove: (move: RealtimeMove) => void,
  onOpponentLeft?: () => void,
): RealtimeChannel {
  const key = `match_moves:${matchId}`;

  const channel = supabase.channel(key, {
    config: {
      broadcast: { self: false }, // Ne pas recevoir ses propres coups
      presence: { key: playerId },
    },
  });

  channel
    // ── Écouter les coups adverses (Broadcast) ──
    // Le coup reçu contient les champs anti-triche : nonce, boardHash, signature
    // La validation est faite dans le store AVANT d'appliquer le coup
    .on('broadcast', { event: 'move' }, (payload) => {
      const move = payload.payload as RealtimeMove;
      // Ne pas traiter ses propres coups (self: false ne fonctionne pas toujours)
      if (move.playerId !== playerId) {
        onMove(move);
      }
    })
    // ── Écouter la présence (joueur qui quitte) ──
    .on('presence', { event: 'leave' }, (payload) => {
      const leftKeys = Object.keys(payload.leftPresences || {});
      if (leftKeys.some(k => k !== playerId) && onOpponentLeft) {
        onOpponentLeft();
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Annoncer sa présence
        await channel.track({ playerId, joinedAt: new Date().toISOString() });
        console.info(`[Realtime] Abonné au match ${matchId.slice(0, 8)}`);
      }
    });

  return registerChannel(key, channel);
}

/**
 * Envoyer un coup de jeu via Realtime Broadcast
 * Le coup inclut les données anti-triche (nonce, boardHash, signature)
 * L'adversaire valide ce coup INDÉPENDAMMENT avant de l'appliquer
 */
export async function broadcastMove(
  matchId: string,
  move: RealtimeMove,
): Promise<void> {
  const key = `match_moves:${matchId}`;
  const channel = activeChannels.get(key);
  if (!channel) {
    console.warn(`[Realtime] Canal non trouvé pour match ${matchId.slice(0, 8)}`);
    return;
  }

  await channel.send({
    type: 'broadcast',
    event: 'move',
    payload: move,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  2. SUBSCRIPTION CHAT — Messages temps réel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * S'abonner aux messages de chat d'un match
 * Utilise Supabase Broadcast pour les messages instantanés
 */
export function subscribeToChatMessages(
  matchId: string,
  senderId: string,
  onMessage: (msg: RealtimeChatMessage) => void,
): RealtimeChannel {
  const key = `chat:${matchId}`;

  const channel = supabase.channel(key, {
    config: { broadcast: { self: false } },
  });

  channel
    .on('broadcast', { event: 'chat_message' }, (payload) => {
      const msg = payload.payload as RealtimeChatMessage;
      if (msg.senderId !== senderId) {
        onMessage(msg);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info(`[Realtime] Chat abonné — match ${matchId.slice(0, 8)}`);
      }
    });

  return registerChannel(key, channel);
}

/**
 * Envoyer un message de chat via Realtime
 */
export async function broadcastChatMessage(
  matchId: string,
  message: RealtimeChatMessage,
): Promise<void> {
  const key = `chat:${matchId}`;
  const channel = activeChannels.get(key);
  if (!channel) {
    // Si pas de channel actif, envoyer quand même via un channel temporaire
    const tempChannel = supabase.channel(key, { config: { broadcast: { self: true } } });
    await tempChannel.subscribe();
    await tempChannel.send({ type: 'broadcast', event: 'chat_message', payload: message });
    return;
  }

  await channel.send({
    type: 'broadcast',
    event: 'chat_message',
    payload: message,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  3. SUBSCRIPTION NOTIFICATIONS — Alertes temps réel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * S'abonner aux notifications d'un joueur (Postgres Changes)
 */
export function subscribeToNotifications(
  playerId: string,
  onNotification: (notif: RealtimeNotification) => void,
): RealtimeChannel | null {
  const key = `notifications:${playerId}`;

  try {
    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `player_id=eq.${playerId}`,
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          onNotification({
            id: r.id as string,
            playerId: r.player_id as string,
            type: r.type as string,
            title: r.title as string,
            message: r.message as string,
            fromPlayer: r.from_player as string | null,
            amount: r.amount !== null ? Number(r.amount) : null,
            matchId: r.match_id as string | null,
            createdAt: r.created_at as string,
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info(`[Realtime] Notifications abonnées — joueur ${playerId.slice(0, 8)}`);
        }
      });

    return registerChannel(key, channel);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  4. SUBSCRIPTION DÉFIS — Mises à jour en temps réel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * S'abonner aux changements de statut des défis d'un joueur
 */
export function subscribeToChallenges(
  playerId: string,
  onChallengeUpdate: (update: RealtimeChallengeUpdate) => void,
  onNewChallenge?: (challenge: Record<string, unknown>) => void,
): RealtimeChannel | null {
  const key = `challenges:${playerId}`;

  try {
    const channel = supabase
      .channel(key)
      // Nouveau défi reçu (direct ou défi public)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'challenges',
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const toPlayerId = (row.to_player_id as string | null) ?? null;
          if (toPlayerId === null || toPlayerId === playerId || row.from_player_id === playerId) {
            if (onNewChallenge) onNewChallenge(row);
          }
        }
      )
      // Défi mis à jour (accepté/annulé/expiré)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'challenges',
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          if (r.from_player_id === playerId || r.to_player_id === playerId || r.to_player_id === null) {
            onChallengeUpdate({
              challengeId: r.id as string,
              status: r.status as 'open' | 'accepted' | 'cancelled' | 'expired',
              fromPlayerId: r.from_player_id as string,
              toPlayerId: (r.to_player_id as string | null) ?? null,
              gameId: (r.game_id as string | null) ?? null,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info(`[Realtime] Défis abonnés — joueur ${playerId.slice(0, 8)}`);
        }
      });

    return registerChannel(key, channel);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  5. PRÉSENCE EN LIGNE — Joueurs connectés
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rejoindre le canal de présence global (joueurs en ligne)
 */
export function joinPresenceChannel(
  player: RealtimePresence,
  onSync: (onlinePlayers: RealtimePresence[]) => void,
): RealtimeChannel {
  const key = 'global_presence';

  const channel = supabase.channel(key, {
    config: { presence: { key: player.playerId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<RealtimePresence>();
      const players: RealtimePresence[] = Object.values(state)
        .flat()
        .map(p => p as unknown as RealtimePresence);
      onSync(players);
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      console.info(`[Realtime] Joueur rejoint:`, newPresences);
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.info(`[Realtime] Joueur parti:`, leftPresences);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(player);
        console.info(`[Realtime] Présence active — ${player.playerName}`);
      }
    });

  return registerChannel(key, channel);
}

/**
 * Mettre à jour la présence (ex: en cours de match)
 */
export async function updatePresence(
  playerId: string,
  updates: Partial<RealtimePresence>,
): Promise<void> {
  const key = 'global_presence';
  const channel = activeChannels.get(key);
  if (!channel) return;
  await channel.track({ playerId, ...updates });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  6. ÉTAT DU MATCH — Synchronisation complète
// ═══════════════════════════════════════════════════════════════════════════════

export interface MatchStateSync {
  matchId: string;
  playerId: string;
  boardState: string; // JSON des pièces
  currentTurn: 'red' | 'black';
  consecutiveDraws: number;
  gameOver: boolean;
  winner: 'red' | 'black' | 'draw' | null;
  timestamp: string;
}

/**
 * Synchroniser l'état complet du plateau après chaque coup
 */
export async function broadcastMatchState(
  matchId: string,
  state: MatchStateSync,
): Promise<void> {
  const key = `match_moves:${matchId}`;
  const channel = activeChannels.get(key);
  if (!channel) return;

  await channel.send({
    type: 'broadcast',
    event: 'match_state',
    payload: state,
  });
}

/**
 * S'abonner à l'état complet du match (reçu de l'adversaire)
 */
export function subscribeToMatchState(
  matchId: string,
  playerId: string,
  onState: (state: MatchStateSync) => void,
): void {
  const key = `match_moves:${matchId}`;
  const channel = activeChannels.get(key);
  if (!channel) return;

  // On ajoute un listener sur le channel existant
  channel.on('broadcast', { event: 'match_state' }, (payload) => {
    const state = payload.payload as MatchStateSync;
    if (state.playerId !== playerId) {
      onState(state);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  7. CLEANUP — Désabonnement propre
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Se désabonner d'un match (quand la partie se termine ou que le joueur quitte)
 */
export function unsubscribeFromMatch(matchId: string): void {
  unsubscribe(`match_moves:${matchId}`);
  unsubscribe(`chat:${matchId}`);
  console.info(`[Realtime] Désabonné du match ${matchId.slice(0, 8)}`);
}

/**
 * Se désabonner de toutes les notifications d'un joueur
 */
export function unsubscribeFromNotifications(playerId: string): void {
  unsubscribe(`notifications:${playerId}`);
  unsubscribe(`challenges:${playerId}`);
}

/**
 * Quitter le canal de présence (déconnexion)
 */
export function leavePresenceChannel(): void {
  unsubscribe('global_presence');
}

/**
 * Tout désabonner (logout)
 */
export function unsubscribeAll(): void {
  activeChannels.forEach((channel) => {
    supabase.removeChannel(channel);
  });
  activeChannels.clear();
  console.info('[Realtime] Tous les channels fermés');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  8. HOOK REALTIME — Initialisation complète pour un joueur connecté
// ═══════════════════════════════════════════════════════════════════════════════

export interface RealtimeCallbacks {
  onNotification?: (notif: RealtimeNotification) => void;
  onChallengeUpdate?: (update: RealtimeChallengeUpdate) => void;
  onNewChallenge?: (challenge: Record<string, unknown>) => void;
  onPresenceSync?: (players: RealtimePresence[]) => void;
}

/**
 * Initialise toutes les subscriptions pour un joueur connecté
 * À appeler au login, à nettoyer au logout
 */
export async function initPlayerRealtime(
  player: RealtimePresence,
  callbacks: RealtimeCallbacks,
): Promise<void> {
  const available = await checkRealtimeAvailability();
  if (!available) {
    console.info('[Realtime] Mode dégradé — polling localStorage uniquement');
    return;
  }

  // 1. Présence globale
  if (callbacks.onPresenceSync) {
    joinPresenceChannel(player, callbacks.onPresenceSync);
  }

  // 2. Notifications personnelles
  if (callbacks.onNotification) {
    subscribeToNotifications(player.playerId, callbacks.onNotification);
  }

  // 3. Défis entrants/sortants
  if (callbacks.onChallengeUpdate || callbacks.onNewChallenge) {
    subscribeToChallenges(
      player.playerId,
      callbacks.onChallengeUpdate || (() => {}),
      callbacks.onNewChallenge,
    );
  }
}

/**
 * Initialise les subscriptions pour un match spécifique
 */
export async function initMatchRealtime(
  matchId: string,
  playerId: string,
  callbacks: {
    onMove: (move: RealtimeMove) => void;
    onMatchState?: (state: MatchStateSync) => void;
    onChatMessage: (msg: RealtimeChatMessage) => void;
    onOpponentLeft?: () => void;
  },
): Promise<boolean> {
  const available = await checkRealtimeAvailability();
  if (!available) return false;

  // 1. Coups de jeu
  const matchChannel = subscribeToMatchMoves(
    matchId,
    playerId,
    callbacks.onMove,
    callbacks.onOpponentLeft,
  );

  // 2. État du match complet (optionnel)
  if (callbacks.onMatchState) {
    // Le listener est ajouté sur le même channel après subscription
    setTimeout(() => {
      subscribeToMatchState(matchId, playerId, callbacks.onMatchState!);
    }, 500);
  }

  // 3. Chat
  subscribeToChatMessages(matchId, playerId, callbacks.onChatMessage);

  console.info(`[Realtime] Match ${matchId.slice(0, 8)} — Realtime actif`);
  return !!matchChannel;
}
