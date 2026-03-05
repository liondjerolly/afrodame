/**
 * CHALLENGE REALTIME SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Système temps réel pour les défis avec :
 *   1. Supabase Realtime (Broadcast + Postgres Changes) — instantané
 *   2. Polling automatique toutes les 4 secondes — fallback garanti
 *   3. Détection intelligente : ne recharge que si données changées
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ChallengeService, NotificationService, type ChallengeData } from './database';

// ─── Registry des intervals & channels ────────────────────────────────────────
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let challengeChannel: RealtimeChannel | null = null;
let notifChannel: RealtimeChannel | null = null;
let lastChallengeHash = '';

// ─── Callbacks globaux ────────────────────────────────────────────────────────
type OnNewChallenge = (challenge: ChallengeData) => void;
type OnChallengeUpdate = (id: string, status: 'open' | 'accepted' | 'cancelled' | 'expired') => void;
type OnReload = () => void;

interface ChallengeRealtimeCallbacks {
  onNewChallenge: OnNewChallenge;
  onChallengeUpdate: OnChallengeUpdate;
  onReload: OnReload;
}

// ─── Hash rapide pour détecter les changements ───────────────────────────────
function hashChallenges(challenges: ChallengeData[]): string {
  return challenges.map(c => `${c.id}:${c.status}`).join('|');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DÉMARRER le système temps réel des défis
// ═══════════════════════════════════════════════════════════════════════════════

export async function startChallengeRealtime(
  playerId: string,
  callbacks: ChallengeRealtimeCallbacks,
): Promise<void> {
  // Nettoyer les anciens abonnements
  stopChallengeRealtime();

  // ── 1. Essayer Supabase Realtime (Postgres Changes) ──────────────────────
  try {
    const key = `challenges_rt:${playerId}`;

    challengeChannel = supabase
      .channel(key)
      // Nouveau défi entrant (direct ou public)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'challenges',
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          const challenge: ChallengeData = {
            id: r.id as string,
            fromPlayerId: r.from_player_id as string,
            toPlayerId: (r.to_player_id as string | null) ?? null,
            acceptedByPlayerId: (r.accepted_by_player_id as string | null) ?? null,
            fromPlayerName: r.from_player_name as string,
            betAmount: Number(r.bet_amount),
            currency: r.currency as 'CDF' | 'USD',
            pieceCount: Number(r.piece_count),
            boardSize: Number(r.board_size),
            timePerTurn: Number(r.time_per_turn),
            status: ((r.status as ChallengeData['status']) || 'open'),
            gameId: (r.game_id as string | null) ?? null,
            expiresAt: (r.expires_at as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            acceptedAt: (r.accepted_at as string | null) ?? null,
            cancelledAt: (r.cancelled_at as string | null) ?? null,
            expiredAt: (r.expired_at as string | null) ?? null,
            createdAt: r.created_at as string,
          };
          if (
            challenge.toPlayerId === null ||
            challenge.toPlayerId === playerId ||
            challenge.fromPlayerId === playerId
          ) {
            console.info('[ChallengeRT] ⚔️ Nouveau défi reçu en temps réel:', challenge.fromPlayerName);
            callbacks.onNewChallenge(challenge);
          }
        }
      )
      // Mise à jour statut (UPDATE sur mes défis)
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
            const status = r.status as 'open' | 'accepted' | 'cancelled' | 'expired';
            console.info('[ChallengeRT] Statut défi mis à jour:', status);
            callbacks.onChallengeUpdate(r.id as string, status);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[ChallengeRT] ✅ Supabase Realtime actif pour les défis');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.info('[ChallengeRT] Realtime indisponible → polling activé');
          startPolling(playerId, callbacks);
        }
      });

    // ── 2. Canal Broadcast pour défis (fonctionne même sans tables) ──────
    const broadcastKey = `challenge_broadcast:${playerId}`;
    notifChannel = supabase
      .channel(broadcastKey, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'new_challenge' }, (payload) => {
        const challenge = payload.payload as ChallengeData;
        console.info('[ChallengeRT] 📡 Broadcast défi reçu:', challenge.fromPlayerName);
        callbacks.onNewChallenge(challenge);
      })
      .on('broadcast', { event: 'challenge_update' }, (payload) => {
        const { id, status } = payload.payload as { id: string; status: 'open' | 'accepted' | 'cancelled' | 'expired' };
        callbacks.onChallengeUpdate(id, status);
      })
      .subscribe();

  } catch (err) {
    console.info('[ChallengeRT] Supabase indisponible, polling activé:', err);
  }

  // ── 3. Polling automatique garanti (toujours actif en parallèle) ──────────
  startPolling(playerId, callbacks);
}

// ─── Broadcast un défi vers l'adversaire ─────────────────────────────────────
export async function broadcastChallenge(
  toPlayerId: string,
  challenge: ChallengeData,
): Promise<void> {
  try {
    const broadcastKey = `challenge_broadcast:${toPlayerId}`;
    const channel = supabase.channel(broadcastKey, {
      config: { broadcast: { self: true } },
    });
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'new_challenge',
      payload: challenge,
    });
    // Fermer après envoi
    setTimeout(() => supabase.removeChannel(channel), 2000);
    console.info('[ChallengeRT] 📡 Défi broadcaste vers:', toPlayerId.slice(0, 8));
  } catch (err) {
    console.debug('[ChallengeRT] Broadcast échoué (silencieux):', err);
  }
}

// ─── Broadcast mise à jour statut ────────────────────────────────────────────
export async function broadcastChallengeUpdate(
  toPlayerId: string,
  challengeId: string,
  status: 'open' | 'accepted' | 'cancelled' | 'expired',
): Promise<void> {
  try {
    const broadcastKey = `challenge_broadcast:${toPlayerId}`;
    const channel = supabase.channel(broadcastKey, {
      config: { broadcast: { self: true } },
    });
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'challenge_update',
      payload: { id: challengeId, status },
    });
    setTimeout(() => supabase.removeChannel(channel), 2000);
  } catch {
    // silencieux
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POLLING AUTOMATIQUE — Fallback garanti toutes les 4 secondes
// ═══════════════════════════════════════════════════════════════════════════════

function startPolling(
  playerId: string,
  callbacks: ChallengeRealtimeCallbacks,
): void {
  if (pollingInterval) return; // Éviter les doublons

  console.info('[ChallengeRT] 🔄 Polling automatique démarré (4s)');

  pollingInterval = setInterval(async () => {
    try {
      // Charger tous les défis du joueur depuis localStorage (instantané)
      const challenges = await ChallengeService.getByPlayer(playerId);
      const currentHash = hashChallenges(challenges);

      // Ne recharger que si les données ont changé
      if (currentHash !== lastChallengeHash) {
        lastChallengeHash = currentHash;

        // Détecter les nouveaux défis entrants en attente
        const pendingIncoming = challenges.filter(
          c => c.toPlayerId === playerId && c.status === 'open'
        );

        if (pendingIncoming.length > 0) {
          console.info(`[ChallengeRT] 🔄 ${pendingIncoming.length} défi(s) en attente détecté(s)`);
        }

        // Déclencher le rechargement complet
        callbacks.onReload();
      }

      // Aussi charger les notifications non lues (pour badge)
      const notifs = await NotificationService.getByPlayer(playerId);
      const unreadChallenges = notifs.filter(n => n.type === 'challenge' && !n.read);
      if (unreadChallenges.length > 0) {
        callbacks.onReload();
      }

    } catch {
      // Silencieux — erreur réseau ou localStorage indisponible
    }
  }, 4000); // Toutes les 4 secondes
}

// ─── Polling immédiat (force une vérification maintenant) ────────────────────
export async function pollChallengesNow(
  playerId: string,
  onReload: OnReload,
): Promise<void> {
  try {
    const challenges = await ChallengeService.getByPlayer(playerId);
    const currentHash = hashChallenges(challenges);
    if (currentHash !== lastChallengeHash) {
      lastChallengeHash = currentHash;
      onReload();
    }
  } catch {
    // silencieux
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ARRÊTER le système temps réel
// ═══════════════════════════════════════════════════════════════════════════════

export function stopChallengeRealtime(): void {
  // Arrêter le polling
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.info('[ChallengeRT] Polling arrêté');
  }

  // Désabonner les channels Supabase
  if (challengeChannel) {
    supabase.removeChannel(challengeChannel);
    challengeChannel = null;
  }
  if (notifChannel) {
    supabase.removeChannel(notifChannel);
    notifChannel = null;
  }

  // Reset hash
  lastChallengeHash = '';
}
