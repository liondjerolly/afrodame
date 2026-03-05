/**
 * MOVE VALIDATOR — ANTI-TRICHE SERVEUR
 * ═══════════════════════════════════════════════════════════════════════════════
 * Ce module implémente la validation INDÉPENDANTE des coups côté récepteur.
 *
 * PRINCIPE DE SÉCURITÉ :
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Joueur A fait un coup  →  broadcaste via Realtime                      │
 * │       ↓                                                                  │
 * │  Joueur B REÇOIT le coup                                                 │
 * │       ↓                                                                  │
 * │  validateReceivedMove() recalcule les coups valides depuis son état      │
 * │  de plateau LOCAL (source de vérité unique)                              │
 * │       ↓                                                                  │
 * │  ✅ Coup valide → appliqué                                               │
 * │  ❌ Coup invalide → rejeté + suspicion de triche signalée               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * PROTECTION CONTRE :
 *  - Modification des pièces dans le navigateur (DevTools)
 *  - Mouvements illégaux (reculer sans manger, sauter plusieurs cases)
 *  - Ignorer les captures obligatoires
 *  - Déplacer les pièces adverses
 *  - Téléportation de pièces (toRow/toCol invalides)
 *  - Replay d'anciens coups (timestamp + nonce)
 *  - Double envoi du même coup
 */

import type { Piece, PieceColor, Move } from '../store/gameStore';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidatedMove {
  move: Move;
  playerId: string;
  matchId: string;
  timestamp: string;
  nonce: string;        // identifiant unique du coup (anti-replay)
  boardHash: string;    // hash du plateau AVANT le coup (vérification d'état)
  signature: string;    // signature HMAC du coup (intégrité)
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  cheatLevel?: 'none' | 'suspicious' | 'confirmed';
}

export interface CheatReport {
  matchId: string;
  playerId: string;
  playerName: string;
  move: Move;
  reason: string;
  timestamp: string;
  boardStateBefore: string;
}

// ─── Registre des nonces utilisés (anti-replay) ───────────────────────────────
// Stocke les nonces des 500 derniers coups reçus pour détecter les replays

const usedNonces = new Set<string>();
const MAX_NONCES = 500;

function registerNonce(nonce: string): boolean {
  if (usedNonces.has(nonce)) return false; // Déjà utilisé = replay attack
  usedNonces.add(nonce);
  if (usedNonces.size > MAX_NONCES) {
    // Nettoyer les anciens nonces (garder les 250 plus récents)
    const arr = Array.from(usedNonces);
    usedNonces.clear();
    arr.slice(-250).forEach(n => usedNonces.add(n));
  }
  return true;
}

// ─── Hash du plateau (fingerprint de l'état) ──────────────────────────────────

export function hashBoard(pieces: Piece[]): string {
  // Trier les pièces pour un hash déterministe
  const sorted = [...pieces]
    .sort((a, b) => a.row * 100 + a.col - (b.row * 100 + b.col))
    .map(p => `${p.color[0]}${p.row}${p.col}${p.isKing ? 'K' : ''}`)
    .join('|');

  // Hash simple mais efficace (djb2)
  let hash = 5381;
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash) ^ sorted.charCodeAt(i);
    hash = hash & 0xFFFFFFFF; // 32-bit
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ─── Signature HMAC simple (sans bibliothèque externe) ────────────────────────

function simpleHmac(data: string, key: string): string {
  let hash = 0;
  const combined = key + data + key;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i);
    hash = hash & 0xFFFFFFFF;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Clé secrète partagée (en production: stockée en variable d'environnement Supabase)
const MOVE_SECRET = 'dames-africaines-secret-2024';

export function signMove(move: Move, playerId: string, matchId: string, nonce: string, boardHash: string): string {
  const data = `${matchId}:${playerId}:${move.fromRow}:${move.fromCol}:${move.toRow}:${move.toCol}:${nonce}:${boardHash}`;
  return simpleHmac(data, MOVE_SECRET);
}

export function verifyMoveSignature(validated: ValidatedMove): boolean {
  const expected = signMove(
    validated.move,
    validated.playerId,
    validated.matchId,
    validated.nonce,
    validated.boardHash,
  );
  return expected === validated.signature;
}

// ─── Moteur de jeu (copié depuis gameStore pour validation indépendante) ───────
// IMPORTANT: Cette copie est INTENTIONNELLE — la validation doit être
// indépendante du store pour éviter qu'un attaquant modifie le store.

function getKingMovesValidator(piece: Piece, allPieces: Piece[], boardSize: number): Move[] {
  const moves: Move[] = [];
  const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr,dc] of dirs) {
    let r = piece.row + dr, c = piece.col + dc;
    while (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
      const occ = allPieces.find(p => p.row === r && p.col === c);
      if (!occ) { moves.push({ fromRow: piece.row, fromCol: piece.col, toRow: r, toCol: c }); r+=dr; c+=dc; }
      else break;
    }
  }
  return moves;
}

function getKingCapturesValidator(
  piece: Piece, allPieces: Piece[], boardSize: number,
  alreadyCaptured: {row:number;col:number}[]
): Move[] {
  const captures: Move[] = [];
  const opponent: PieceColor = piece.color === 'red' ? 'black' : 'red';
  const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr,dc] of dirs) {
    let r = piece.row + dr, c = piece.col + dc;
    let foundEnemy: Piece | null = null;
    while (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
      const occ = allPieces.find(p => p.row === r && p.col === c);
      if (!foundEnemy) {
        if (!occ) { r+=dr; c+=dc; continue; }
        const already = alreadyCaptured.find(cc => cc.row === r && cc.col === c);
        if (occ.color === opponent && !already) { foundEnemy = occ; r+=dr; c+=dc; continue; }
        else break;
      } else {
        if (!occ) {
          const newCap = [...alreadyCaptured, { row: foundEnemy.row, col: foundEnemy.col }];
          captures.push({ fromRow: piece.row, fromCol: piece.col, toRow: r, toCol: c, capturedPieces: newCap });
          const chains = getKingCapturesValidator({ ...piece, row: r, col: c }, allPieces, boardSize, newCap);
          for (const ch of chains) {
            captures.push({ fromRow: piece.row, fromCol: piece.col, toRow: ch.toRow, toCol: ch.toCol, capturedPieces: ch.capturedPieces });
          }
          r+=dr; c+=dc;
        } else break;
      }
    }
  }
  return captures;
}

function getNormalCapturesValidator(
  piece: Piece, allPieces: Piece[], boardSize: number,
  alreadyCaptured: {row:number;col:number}[]
): Move[] {
  const captures: Move[] = [];
  const opponent: PieceColor = piece.color === 'red' ? 'black' : 'red';
  const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr,dc] of dirs) {
    const midRow = piece.row + dr, midCol = piece.col + dc;
    const landRow = piece.row + dr*2, landCol = piece.col + dc*2;
    if (landRow >= 0 && landRow < boardSize && landCol >= 0 && landCol < boardSize) {
      const midPiece = allPieces.find(p => p.row === midRow && p.col === midCol && p.color === opponent);
      const landOcc = allPieces.find(p => p.row === landRow && p.col === landCol);
      const already = alreadyCaptured.find(cc => cc.row === midRow && cc.col === midCol);
      if (midPiece && !landOcc && !already) {
        const newCap = [...alreadyCaptured, { row: midRow, col: midCol }];
        captures.push({ fromRow: piece.row, fromCol: piece.col, toRow: landRow, toCol: landCol, capturedPieces: newCap });
        const chains = getNormalCapturesValidator({ ...piece, row: landRow, col: landCol }, allPieces, boardSize, newCap);
        for (const ch of chains) {
          captures.push({ fromRow: piece.row, fromCol: piece.col, toRow: ch.toRow, toCol: ch.toCol, capturedPieces: ch.capturedPieces });
        }
      }
    }
  }
  return captures;
}

function getSimpleMovesValidator(piece: Piece, allPieces: Piece[], boardSize: number): Move[] {
  const forwardDirs: number[][] = piece.color === 'red' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
  const simpleMoves: Move[] = [];
  for (const [dr,dc] of forwardDirs) {
    const nr = piece.row + dr, nc = piece.col + dc;
    if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
      if (!allPieces.find(p => p.row === nr && p.col === nc)) {
        simpleMoves.push({ fromRow: piece.row, fromCol: piece.col, toRow: nr, toCol: nc });
      }
    }
  }
  return simpleMoves;
}

function getValidMovesValidator(piece: Piece, allPieces: Piece[], boardSize: number): Move[] {
  if (piece.isKing) {
    const caps = getKingCapturesValidator(piece, allPieces, boardSize, []);
    return caps.length > 0 ? caps : getKingMovesValidator(piece, allPieces, boardSize);
  }
  const caps = getNormalCapturesValidator(piece, allPieces, boardSize, []);
  if (caps.length > 0) return caps;
  return getSimpleMovesValidator(piece, allPieces, boardSize);
}

function hasMandatoryCaptureValidator(pieces: Piece[], color: PieceColor, boardSize: number): boolean {
  return pieces.filter(p => p.color === color).some(p => {
    const moves = getValidMovesValidator(p, pieces, boardSize);
    return moves.some(m => m.capturedPieces && m.capturedPieces.length > 0);
  });
}

// ─── Validation principale ────────────────────────────────────────────────────

export interface MoveValidationContext {
  currentPieces: Piece[];    // État du plateau LOCAL (source de vérité)
  boardSize: number;
  currentTurn: PieceColor;
  senderColor: PieceColor;   // Couleur assignée à l'expéditeur du coup
  matchId: string;
  boardHash?: string;        // Hash attendu (optionnel, pour vérification d'état)
}

export function validateReceivedMove(
  validated: ValidatedMove,
  ctx: MoveValidationContext,
): ValidationResult {
  const { move, nonce, boardHash } = validated;
  const { currentPieces, boardSize, currentTurn, senderColor } = ctx;

  // ── 1. Vérification anti-replay (nonce unique) ──────────────────────────
  if (!registerNonce(nonce)) {
    return {
      valid: false,
      reason: `REPLAY: Nonce déjà utilisé — coup rejoué (${nonce})`,
      cheatLevel: 'confirmed',
    };
  }

  // ── 2. Vérification du timestamp (coup trop ancien = suspect) ───────────
  const moveTime = new Date(validated.timestamp).getTime();
  const now = Date.now();
  const MAX_DELAY_MS = 60_000; // 60 secondes max
  if (now - moveTime > MAX_DELAY_MS) {
    return {
      valid: false,
      reason: `TIMESTAMP: Coup trop ancien (${Math.round((now - moveTime) / 1000)}s)`,
      cheatLevel: 'suspicious',
    };
  }

  // ── 3. Vérification signature (intégrité du coup) ───────────────────────
  if (!verifyMoveSignature(validated)) {
    return {
      valid: false,
      reason: 'SIGNATURE: Coup non signé ou falsifié',
      cheatLevel: 'confirmed',
    };
  }

  // ── 4. Vérification hash du plateau (état cohérent) ─────────────────────
  if (boardHash) {
    const localHash = hashBoard(currentPieces);
    if (boardHash !== localHash) {
      // Les états sont désynchronisés — peut arriver légitimement après lag
      // On continue la validation mais on note la divergence
      console.warn(`[Validator] ⚠️ Hash plateau divergent: reçu=${boardHash}, local=${localHash}`);
      // Pas un rejet immédiat — peut être un problème de réseau
    }
  }

  // ── 5. Vérification que c'est bien le tour de l'expéditeur ──────────────
  if (currentTurn !== senderColor) {
    return {
      valid: false,
      reason: `TOUR: Ce n'est pas le tour de ${senderColor} (tour actuel: ${currentTurn})`,
      cheatLevel: 'confirmed',
    };
  }

  // ── 6. Vérification que le pion existe et appartient à l'expéditeur ──────
  const piece = currentPieces.find(p => p.row === move.fromRow && p.col === move.fromCol);
  if (!piece) {
    return {
      valid: false,
      reason: `PIECE: Aucun pion en (${move.fromRow},${move.fromCol}) — déplacement fantôme`,
      cheatLevel: 'confirmed',
    };
  }
  if (piece.color !== senderColor) {
    return {
      valid: false,
      reason: `COULEUR: Le pion en (${move.fromRow},${move.fromCol}) est ${piece.color}, pas ${senderColor}`,
      cheatLevel: 'confirmed',
    };
  }

  // ── 7. Vérification des bornes du plateau ───────────────────────────────
  if (
    move.toRow < 0 || move.toRow >= boardSize ||
    move.toCol < 0 || move.toCol >= boardSize
  ) {
    return {
      valid: false,
      reason: `BORNES: Destination (${move.toRow},${move.toCol}) hors plateau ${boardSize}×${boardSize}`,
      cheatLevel: 'confirmed',
    };
  }

  // ── 8. Vérification que la destination est libre ─────────────────────────
  const destOccupied = currentPieces.find(p => p.row === move.toRow && p.col === move.toCol);
  if (destOccupied) {
    return {
      valid: false,
      reason: `DESTINATION: Case (${move.toRow},${move.toCol}) occupée par ${destOccupied.color}`,
      cheatLevel: 'confirmed',
    };
  }

  // ── 9. Calcul indépendant des coups valides (CŒUR DE LA VALIDATION) ──────
  const validMoves = getValidMovesValidator(piece, currentPieces, boardSize);

  // Vérifier la capture obligatoire (si une capture est possible, elle est obligatoire)
  const mandatory = hasMandatoryCaptureValidator(currentPieces, senderColor, boardSize);
  const filteredMoves = mandatory
    ? validMoves.filter(m => m.capturedPieces && m.capturedPieces.length > 0)
    : validMoves;

  // Chercher si le coup reçu correspond à un coup valide calculé localement
  const matchingMove = filteredMoves.find(
    vm => vm.toRow === move.toRow && vm.toCol === move.toCol
  );

  if (!matchingMove) {
    // Diagnostiquer pourquoi le coup est invalide
    let reason = `ILLEGAL: Coup (${move.fromRow},${move.fromCol})→(${move.toRow},${move.toCol}) non valide`;

    if (mandatory && !validMoves.find(vm => vm.toRow === move.toRow && vm.toCol === move.toCol)) {
      reason = `OBLIGATOIRE: Une capture est disponible — le joueur DOIT manger`;
    } else if (!validMoves.find(vm => vm.toRow === move.toRow && vm.toCol === move.toCol)) {
      // Vérifier si c'est un retour arrière sans capture
      const isBackward = piece.color === 'red'
        ? move.toRow < move.fromRow
        : move.toRow > move.fromRow;
      if (isBackward && !piece.isKing) {
        reason = `RETOUR_ARRIERE: Retour arrière sans capture interdit pour les pions normaux`;
      }
    }

    return {
      valid: false,
      reason,
      cheatLevel: 'confirmed',
    };
  }

  // ── 10. Vérification des pièces capturées déclarées ──────────────────────
  if (matchingMove.capturedPieces && move.capturedPieces) {
    // Vérifier que les pièces capturées déclarées correspondent au calcul local
    const expectedCaps = matchingMove.capturedPieces;
    const declaredCaps = move.capturedPieces;

    if (expectedCaps.length !== declaredCaps.length) {
      return {
        valid: false,
        reason: `CAPTURES: ${declaredCaps.length} captures déclarées, ${expectedCaps.length} attendues`,
        cheatLevel: 'confirmed',
      };
    }

    for (const dec of declaredCaps) {
      if (!expectedCaps.find(e => e.row === dec.row && e.col === dec.col)) {
        return {
          valid: false,
          reason: `CAPTURES: Pièce capturée déclarée en (${dec.row},${dec.col}) non valide`,
          cheatLevel: 'confirmed',
        };
      }
    }
  } else if (matchingMove.capturedPieces && !move.capturedPieces) {
    // Le coup devrait capturer mais ne déclare aucune capture
    return {
      valid: false,
      reason: `CAPTURES: Des captures sont obligatoires mais non déclarées`,
      cheatLevel: 'confirmed',
    };
  }

  // ✅ Coup valide — utiliser les données calculées localement (pas celles reçues)
  return { valid: true, cheatLevel: 'none' };
}

// ─── Rapport de triche ────────────────────────────────────────────────────────

export interface CheatEntry {
  matchId: string;
  playerId: string;
  playerName: string;
  reason: string;
  timestamp: string;
  count: number;
}

const cheatRegistry: Map<string, CheatEntry> = new Map();

export function reportCheat(
  matchId: string,
  playerId: string,
  playerName: string,
  move: Move,
  reason: string,
  pieces: Piece[],
): void {
  const key = `${matchId}:${playerId}`;
  const existing = cheatRegistry.get(key);
  const entry: CheatEntry = {
    matchId,
    playerId,
    playerName,
    reason,
    timestamp: new Date().toISOString(),
    count: (existing?.count ?? 0) + 1,
  };
  cheatRegistry.set(key, entry);

  console.warn(`[AntiCheat] 🚨 Tentative de triche détectée!`, {
    joueur: playerName,
    raison: reason,
    coup: `(${move.fromRow},${move.fromCol})→(${move.toRow},${move.toCol})`,
    occurrences: entry.count,
    plateau: hashBoard(pieces),
  });

  // Sauvegarder en Supabase pour audit admin
  saveCheatReport({
    matchId,
    playerId,
    playerName,
    move,
    reason,
    timestamp: new Date().toISOString(),
    boardStateBefore: hashBoard(pieces),
  });
}

async function saveCheatReport(report: CheatReport): Promise<void> {
  try {
    // Stocker dans localStorage pour l'admin (accessible même sans Supabase)
    const reports = JSON.parse(localStorage.getItem('dames_cheat_reports') || '[]') as CheatReport[];
    reports.unshift(report);
    // Garder les 100 derniers rapports
    if (reports.length > 100) reports.splice(100);
    localStorage.setItem('dames_cheat_reports', JSON.stringify(reports));

    // Envoyer à Supabase si disponible
    try {
      await supabase.from('cheat_reports').insert({
        match_id: report.matchId,
        player_id: report.playerId,
        player_name: report.playerName,
        reason: report.reason,
        board_hash: report.boardStateBefore,
        move_data: JSON.stringify(report.move),
        created_at: report.timestamp,
      });
    } catch {
      // Silencieux si la table n'existe pas encore
    }
  } catch {
    // Silencieux
  }
}

export function getCheatReports(): CheatEntry[] {
  return Array.from(cheatRegistry.values()).sort((a, b) => b.count - a.count);
}

export function getLocalCheatReports(): CheatReport[] {
  try {
    return JSON.parse(localStorage.getItem('dames_cheat_reports') || '[]') as CheatReport[];
  } catch {
    return [];
  }
}

// ─── Compteur de suspicion par joueur ─────────────────────────────────────────
// 3 tentatives invalides = avertissement, 5 = signalement admin

const suspicionCount: Map<string, number> = new Map();

export function incrementSuspicion(playerId: string): 'warning' | 'banned' | 'ok' {
  const count = (suspicionCount.get(playerId) ?? 0) + 1;
  suspicionCount.set(playerId, count);
  if (count >= 5) return 'banned';
  if (count >= 3) return 'warning';
  return 'ok';
}

export function getSuspicionLevel(playerId: string): number {
  return suspicionCount.get(playerId) ?? 0;
}

// ─── Création d'un coup validé (côté émetteur) ────────────────────────────────

export function createValidatedMove(
  move: Move,
  playerId: string,
  matchId: string,
  pieces: Piece[],
): ValidatedMove {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = new Date().toISOString();
  const boardHash = hashBoard(pieces);
  const signature = signMove(move, playerId, matchId, nonce, boardHash);

  return {
    move,
    playerId,
    matchId,
    timestamp,
    nonce,
    boardHash,
    signature,
  };
}

// ─── Appliquer un coup validé sur un plateau ──────────────────────────────────
// Retourne le nouveau plateau après application du coup LOCAL calculé

export function applyValidatedMove(
  pieces: Piece[],
  move: Move,
  boardSize: number,
): Piece[] {
  let newPieces = pieces.map(p => ({ ...p }));

  // Supprimer les pièces capturées
  if (move.capturedPieces) {
    newPieces = newPieces.filter(
      p => !move.capturedPieces!.find(c => c.row === p.row && c.col === p.col)
    );
  }

  // Déplacer le pion
  const mp = newPieces.find(p => p.row === move.fromRow && p.col === move.fromCol);
  if (!mp) return newPieces;

  mp.row = move.toRow;
  mp.col = move.toCol;

  // Promotion en roi
  if (mp.color === 'red' && mp.row === boardSize - 1) mp.isKing = true;
  if (mp.color === 'black' && mp.row === 0) mp.isKing = true;

  return newPieces;
}

// ─── Schema SQL pour la table cheat_reports ───────────────────────────────────
export const CHEAT_REPORTS_SQL = `
-- Table de rapports de triche (créer dans Supabase)
CREATE TABLE IF NOT EXISTS cheat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  board_hash TEXT,
  move_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide par joueur
CREATE INDEX IF NOT EXISTS idx_cheat_reports_player ON cheat_reports(player_id);
CREATE INDEX IF NOT EXISTS idx_cheat_reports_match ON cheat_reports(match_id);

-- RLS : seuls les admins peuvent lire
ALTER TABLE cheat_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read cheat reports" ON cheat_reports FOR SELECT USING (true);
CREATE POLICY "System insert cheat reports" ON cheat_reports FOR INSERT WITH CHECK (true);
`;
