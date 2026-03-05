import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  PlayerService, MatchService, TransactionService,
  NotificationService, ChallengeService, ChatService, AdminService,
  AdminWalletService, MatchMoveService,
  hashPassword, verifyPassword, initializeDatabase,
  type PlayerData, type TransactionData, type NotificationData,
  type ChallengeData,
} from '../lib/database';
import {
  initPlayerRealtime,
  initMatchRealtime,
  broadcastMove,
  broadcastMatchState,
  broadcastChatMessage,
  unsubscribeFromMatch,
  unsubscribeAll,
  type RealtimeMove,
  type RealtimeChatMessage,
  type MatchStateSync,
} from '../lib/realtime';
import {
  validateReceivedMove,
  createValidatedMove,
  reportCheat,
  incrementSuspicion,
  hashBoard,
  type MoveValidationContext,
} from '../lib/moveValidator';
import { chooseAIMove, type AIDifficulty as StrategyAIDifficulty } from '../lib/aiStrategies';
import {
  startChallengeRealtime,
  stopChallengeRealtime,
  broadcastChallenge,
  broadcastChallengeUpdate,
} from '../lib/challengeRealtime';

let challengeHousekeepingInterval: ReturnType<typeof setInterval> | null = null;

// Codes d'erreur d'inscription
export type RegisterError = 'email_taken' | 'phone_taken' | 'unknown' | null;

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type PieceColor = 'red' | 'black';
export type GameMode = 'ai' | 'online' | 'challenge';
export type AppView = 'home' | 'game' | 'dashboard' | 'wallet' | 'notifications' | 'admin' | 'auth' | 'challenge-setup' | 'arena-ia';
export type AIDifficulty = StrategyAIDifficulty;
export type Currency = 'CDF' | 'USD';

// Wallet virtuel : donnÃ© Ã  la crÃ©ation de compte, non retirable, pour tests/dÃ©mos
export const VIRTUAL_WALLET_CDF = 54000;
export const VIRTUAL_WALLET_USD = 200;

export interface Piece {
  id: string;
  color: PieceColor;
  isKing: boolean;
  row: number;
  col: number;
}

export interface Move {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  capturedPieces?: { row: number; col: number }[];
}

export interface Player {
  id: string;
  name: string;
  firstName: string;
  phone: string;
  email: string;
  password: string;
  balance: number;
  virtualBalanceCDF: number;  // Wallet virtuel CDF â€” non retirable
  virtualBalanceUSD: number;  // Wallet virtuel USD â€” non retirable
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalEarnings: number;
  avatar: string;
  isOnline: boolean;
  preferredCurrency: Currency;
  role: 'player' | 'admin';
}

export interface GameState {
  pieces: Piece[];
  currentTurn: PieceColor;
  selectedPiece: Piece | null;
  validMoves: Move[];
  gameOver: boolean;
  winner: PieceColor | 'draw' | null;
  mode: GameMode;
  drawCount: number;
  matchId: string;
  challengeId: string | null;
  challengeStatus: Challenge['status'] | null;
  betAmount: number;
  currency: Currency;
  timePerTurn: number;
  playerTimeLeft: number;
  opponentTimeLeft: number;
  boardSize: number;
  pieceCount: number;
  playerColor: PieceColor;
  opponentName: string;
  capturedRed: number;
  capturedBlack: number;
  is3D: boolean;
  playerPieceColor: string;
  opponentPieceColor: string;
  moveHistory: Move[];
  consecutiveDraws: number;
  aiDifficulty: AIDifficulty;
  // â”€â”€â”€ Anti-double-dÃ©duction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // true = la mise a dÃ©jÃ  Ã©tÃ© dÃ©duite du wallet (dans initGame)
  // EmpÃªche tout re-dÃ©duction dans abandonGame ou makeMove (fin de partie)
  betDeducted: boolean;
  // true = la mise est en wallet VIRTUEL (non rÃ©el)
  useVirtualBet: boolean;
  // true = gains/pertes dÃ©jÃ  traitÃ©s (fin de partie dÃ©jÃ  rÃ©glÃ©e financiÃ¨rement)
  financialsSettled: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
}

export interface Notification {
  id: string;
  type: 'challenge' | 'win' | 'loss' | 'deposit' | 'withdraw' | 'chat' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  fromPlayer?: string;
  amount?: number;
  matchId?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'win' | 'loss' | 'fee';
  amount: number;
  currency: Currency;
  timestamp: Date;
  description: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface Challenge {
  id: string;
  fromPlayer: string;
  fromPlayerId: string;
  toPlayerId: string | null;
  betAmount: number;
  currency: Currency;
  pieceCount: number;
  boardSize: number;
  timePerTurn: number;
  status: 'open' | 'accepted' | 'cancelled' | 'expired';
  gameId: string | null;
  expiresAt: Date;
  timestamp: Date;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  wins: number;
  isOnline: boolean;
  avatar: string;
  rank: number;
  earnings: number;
}

interface AppStore {
  currentUser: Player | null;
  isAuthenticated: boolean;
  authMode: 'login' | 'register' | 'forgot';
  currentView: AppView;
  previousView: AppView | null;
  logoClickCount: number;
  gameState: GameState | null;
  aiDifficulty: AIDifficulty;
  chatMessages: ChatMessage[];
  unreadMessages: number;
  chatOpen: boolean;
  chatReadOnlyReason: string | null;
  notifications: Notification[];
  transactions: Transaction[];
  challenges: Challenge[];
  openChallenges: Challenge[];
  onlinePlayers: OnlinePlayer[];
  leaderboard: OnlinePlayer[];
  dbLoading: boolean;
  adminSettings: {
    aiMatchTime: number;
    challengeMatchTime: number;
    platformFee: number;
    maxBet: number;
    minBet: number;
    cdfRate: number;
    usdRate: number;
    defaultCurrency: Currency;
  };

  // Auth
  setAuthMode: (mode: 'login' | 'register' | 'forgot') => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: Partial<Player> & { password: string }) => Promise<RegisterError>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<boolean>;
  // Wallet virtuel
  useVirtualBalance: (amount: number, currency: Currency) => Promise<boolean>;
  hasEnoughFunds: (amount: number, currency: Currency, useVirtual?: boolean) => boolean;

  // Navigation
  setCurrentView: (view: AppView) => void;
  handleLogoClick: () => void;

  // Game
  initGame: (mode: GameMode, options?: Partial<GameState> & { aiDiff?: AIDifficulty; useVirtual?: boolean }) => void;
  selectPiece: (piece: Piece) => void;
  makeMove: (move: Move) => void;
  aiMove: () => void;

  // Chat
  addChatMessage: (content: string) => void;
  pollChatMessages: () => Promise<void>;
  realtimeMatchActive: boolean;
  toggleChat: () => void;

  // Notifications
  addNotification: (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationsRead: () => void;
  loadNotifications: () => Promise<void>;

  // Wallet
  deposit: (amount: number, method: string, currency: Currency) => Promise<void>;
  withdraw: (amount: number, method: string, currency: Currency) => Promise<void>;
  updateBalance: (amount: number, type: Transaction['type'], description: string, currency?: Currency) => Promise<void>;
  loadTransactions: () => Promise<void>;

  // Challenges
  sendChallenge: (toPlayer: OnlinePlayer | null, betAmount: number, currency: Currency, pieceCount: number, boardSize: number, timePerTurn: number, useVirtual?: boolean, playerPieceColor?: string, opponentPieceColor?: string, is3D?: boolean) => Promise<void>;
  acceptChallenge: (challengeId: string) => Promise<void>;
  declineChallenge: (challengeId: string) => Promise<void>;
  cancelChallenge: (challengeId: string) => Promise<void>;
  loadChallenges: () => Promise<void>;
  loadOpenChallenges: () => Promise<void>;

  // Players
  loadOnlinePlayers: () => Promise<void>;
  loadLeaderboard: () => Promise<void>;

  // Admin
  updateAdminSettings: (settings: Partial<AppStore['adminSettings']>) => Promise<void>;
  loadAdminSettings: () => Promise<void>;

  // Game
  abandonGame: () => void;

  // Utils
  decrementTimer: () => void;
  setAIDifficulty: (diff: AIDifficulty) => void;
  convertAmount: (amount: number, from: Currency, to: Currency) => number;
  initDB: () => Promise<void>;
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function dbPlayerToStore(p: PlayerData): Player {
  return {
    id: p.id,
    name: p.lastName,
    firstName: p.firstName,
    phone: p.phone,
    email: p.email,
    password: '',
    balance: p.balance,
    virtualBalanceCDF: p.virtualBalanceCDF ?? VIRTUAL_WALLET_CDF,
    virtualBalanceUSD: p.virtualBalanceUSD ?? VIRTUAL_WALLET_USD,
    totalWins: p.totalWins,
    totalLosses: p.totalLosses,
    totalDraws: p.totalDraws,
    totalEarnings: p.totalEarnings,
    avatar: p.avatar,
    isOnline: p.isOnline,
    preferredCurrency: p.preferredCurrency,
    role: p.role,
  };
}

function dbTransactionToStore(t: TransactionData): Transaction {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    timestamp: new Date(t.createdAt),
    description: t.description,
    status: t.status,
  };
}

function dbNotificationToStore(n: NotificationData): Notification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    timestamp: new Date(n.createdAt),
    read: n.read,
    fromPlayer: n.fromPlayer || undefined,
    amount: n.amount || undefined,
    matchId: n.matchId || undefined,
  };
}

function dbChallengeToStore(c: ChallengeData): Challenge {
  return {
    id: c.id,
    fromPlayer: c.fromPlayerName,
    fromPlayerId: c.fromPlayerId,
    toPlayerId: c.toPlayerId,
    betAmount: c.betAmount,
    currency: c.currency,
    pieceCount: c.pieceCount,
    boardSize: c.boardSize,
    timePerTurn: c.timePerTurn,
    status: c.status,
    gameId: c.gameId,
    expiresAt: new Date(c.expiresAt),
    timestamp: new Date(c.createdAt),
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  AFRICAN CHECKERS LOGIC
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function initPieces(boardSize: number = 10, pieceCount?: number): Piece[] {
  const pieces: Piece[] = [];
  const rows = boardSize;
  const piecesPerSide = pieceCount || (boardSize === 10 ? 20 : boardSize === 8 ? 12 : 9);
  let redCount = 0;
  let blackCount = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < rows; col++) {
      if ((row + col) % 2 === 1) {
        if (row < rows / 2 - 1 && redCount < piecesPerSide) {
          pieces.push({ id: uuidv4(), color: 'red', isKing: false, row, col });
          redCount++;
        } else if (row > rows / 2 && blackCount < piecesPerSide) {
          pieces.push({ id: uuidv4(), color: 'black', isKing: false, row, col });
          blackCount++;
        }
      }
    }
  }
  return pieces;
}

/** KING: flying king â€” can slide AND capture along any diagonal corridor */
function getKingMoves(piece: Piece, allPieces: Piece[], boardSize: number): Move[] {
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

function getKingCaptures(piece: Piece, allPieces: Piece[], boardSize: number, alreadyCaptured: {row:number;col:number}[]): Move[] {
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
          const chains = getKingCaptures({ ...piece, row: r, col: c }, allPieces, boardSize, newCap);
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// RÃˆGLE DU RETOUR EN ARRIÃˆRE (African Checkers)
// âœ… Retour arriÃ¨re AUTORISÃ‰ : uniquement si le pion MANGE un adversaire en reculant
// âŒ Retour arriÃ¨re INTERDIT : simple dÃ©placement sans capture â†’ bloquÃ©
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getNormalCaptures(piece: Piece, allPieces: Piece[], boardSize: number, alreadyCaptured: {row:number;col:number}[]): Move[] {
  const captures: Move[] = [];
  const opponent: PieceColor = piece.color === 'red' ? 'black' : 'red';
  // âœ… Les 4 directions sont vÃ©rifiÃ©es pour la CAPTURE (y compris retour arriÃ¨re)
  // Un pion PEUT manger en arriÃ¨re â€” rÃ¨gle africaine stricte
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
        // ChaÃ®ne de captures : continue depuis la nouvelle position dans les 4 dirs
        const chains = getNormalCaptures({ ...piece, row: landRow, col: landCol }, allPieces, boardSize, newCap);
        for (const ch of chains) {
          captures.push({ fromRow: piece.row, fromCol: piece.col, toRow: ch.toRow, toCol: ch.toCol, capturedPieces: ch.capturedPieces });
        }
      }
    }
  }
  return captures;
}

function getSimpleMoves(piece: Piece, allPieces: Piece[], boardSize: number): Move[] {
  // âŒ RETOUR ARRIÃˆRE INTERDIT pour un dÃ©placement simple sans capture
  // Seuls les mouvements en avant sont autorisÃ©s pour un pion non-roi sans prise
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

function getValidMoves(piece: Piece, allPieces: Piece[], boardSize: number = 10): Move[] {
  if (piece.isKing) {
    // Roi : captures en prioritÃ©, sinon tous les dÃ©placements libres en diagonale
    const caps = getKingCaptures(piece, allPieces, boardSize, []);
    return caps.length > 0 ? caps : getKingMoves(piece, allPieces, boardSize);
  }
  // Pion normal :
  // 1. Cherche d'abord les captures (toutes directions, y compris arriÃ¨re) â† OBLIGATOIRE
  const caps = getNormalCaptures(piece, allPieces, boardSize, []);
  if (caps.length > 0) return caps; // Capture obligatoire prioritaire
  // 2. Sinon : uniquement les mouvements simples EN AVANT (retour arriÃ¨re BLOQUÃ‰)
  return getSimpleMoves(piece, allPieces, boardSize);
}

function hasMandatoryCapture(pieces: Piece[], color: PieceColor, boardSize: number): boolean {
  return pieces.filter(p => p.color === color).some(p => {
    const moves = getValidMoves(p, pieces, boardSize);
    return moves.some(m => m.capturedPieces && m.capturedPieces.length > 0);
  });
}

function checkGameOver(pieces: Piece[], currentTurn: PieceColor, boardSize: number, consecutiveDraws: number)
  : { over: boolean; winner: PieceColor | 'draw' | null } {
  const red = pieces.filter(p => p.color === 'red');
  const black = pieces.filter(p => p.color === 'black');
  if (red.length === 0) return { over: true, winner: 'black' };
  if (black.length === 0) return { over: true, winner: 'red' };
  const hasMove = pieces.filter(p => p.color === currentTurn).some(p => getValidMoves(p, pieces, boardSize).length > 0);
  if (!hasMove) return { over: true, winner: currentTurn === 'red' ? 'black' : 'red' };
  // 4th draw rule
  if (consecutiveDraws >= 3) {
    if (red.length > black.length) return { over: true, winner: 'red' };
    if (black.length > red.length) return { over: true, winner: 'black' };
    return { over: true, winner: 'draw' };
  }
  return { over: false, winner: null };
}

// AI ENGINE
function getAIMove(
  pieces: Piece[],
  aiColor: PieceColor,
  boardSize: number,
  difficulty: AIDifficulty,
  consecDraws: number,
): Move | null {
  return chooseAIMove(difficulty, {
    pieces,
    aiColor,
    boardSize,
    consecutiveDraws: consecDraws,
    getValidMoves,
    checkGameOver,
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  ZUSTAND STORE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const useGameStore = create<AppStore>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  authMode: 'login',
  currentView: 'home',
  previousView: null,
  logoClickCount: 0,
  gameState: null,
  aiDifficulty: 'moyen',
  chatMessages: [],
  unreadMessages: 0,
  chatOpen: false,
  chatReadOnlyReason: null,
  notifications: [],
  transactions: [],
  challenges: [],
  openChallenges: [],
  onlinePlayers: [],
  leaderboard: [],
  dbLoading: false,
  realtimeMatchActive: false,
  adminSettings: {
    aiMatchTime: 30,
    challengeMatchTime: 60,
    platformFee: 2,
    maxBet: 500000,
    minBet: 500,
    cdfRate: 2800,
    usdRate: 1,
    defaultCurrency: 'CDF',
  },

  // â”€â”€ DB Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  initDB: async () => {
    // 1. Init donnÃ©es par dÃ©faut + suppression matchs IA rÃ©siduels
    initializeDatabase();
    // 2. Nettoyage supplÃ©mentaire Supabase des matchs IA (si configurÃ©)
    await MatchService.cleanAIMatches();
    // 3. Chargement config admin
    await get().loadAdminSettings();
    // 4. Chargement classement et joueurs en ligne
    await get().loadLeaderboard();
    await get().loadOnlinePlayers();
  },

  // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  setAuthMode: (mode) => set({ authMode: mode }),

  login: async (email, password) => {
    set({ dbLoading: true });
    const player = await PlayerService.findByEmail(email);
    set({ dbLoading: false });
    if (!player) return false;
    if (!verifyPassword(password, player.passwordHash)) return false;
    await PlayerService.setOnline(player.id, true);
    const user = dbPlayerToStore(player);
    set({ currentUser: user, isAuthenticated: true, currentView: 'home' });
    await get().loadNotifications();
    await get().loadTransactions();
    await get().loadChallenges();
    await get().loadOpenChallenges();

    // â”€â”€ Initialiser Supabase Realtime pour ce joueur â”€â”€
    initPlayerRealtime(
      {
        playerId: player.id,
        playerName: `${player.firstName} ${player.lastName}`,
        isOnline: true,
        currentMatch: null,
      },
      {
        onNotification: (notif) => {
          const n: Notification = {
            id: notif.id,
            type: notif.type as Notification['type'],
            title: notif.title,
            message: notif.message,
            timestamp: new Date(notif.createdAt),
            read: false,
            fromPlayer: notif.fromPlayer || undefined,
            amount: notif.amount || undefined,
            matchId: notif.matchId || undefined,
          };
          set(s => ({ notifications: [n, ...s.notifications] }));
        },
        onChallengeUpdate: async (update) => {
          await get().loadChallenges();
          await get().loadOpenChallenges();
          const st = get().gameState;
          if (st && st.challengeId === update.challengeId) {
            const reason =
              update.status === 'cancelled'
                ? 'Le chat est en lecture seule: ce dÃ©fi a Ã©tÃ© annulÃ©.'
                : update.status === 'expired'
                  ? 'Le chat est en lecture seule: ce dÃ©fi a expirÃ©.'
                  : null;
            set({
              gameState: { ...st, challengeStatus: update.status },
              chatReadOnlyReason: reason,
            });
          }
        },
        onNewChallenge: async (challengeRaw) => {
          // Recharger les dÃ©fis quand un nouveau arrive (via Realtime notifications)
          await get().loadChallenges();
          await get().loadOpenChallenges();
          // Afficher une notification immÃ©diate
          if (challengeRaw) {
            const c = challengeRaw as Record<string, unknown>;
            get().addNotification({
              type: 'challenge',
              title: `âš”ï¸ Nouveau dÃ©fi de ${c.from_player_name || c.fromPlayerName || 'un joueur'}!`,
              message: `Mise: ${Number(c.bet_amount || c.betAmount || 0).toLocaleString()} ${c.currency || 'CDF'} â€¢ ${c.board_size || c.boardSize || 10}Ã—${c.board_size || c.boardSize || 10}`,
              fromPlayer: String(c.from_player_name || c.fromPlayerName || ''),
              matchId: String(c.id || ''),
            });
          }
        },
        onPresenceSync: (players) => {
          // Mettre Ã  jour les joueurs en ligne depuis la prÃ©sence Realtime
          const mapped: OnlinePlayer[] = players.map((p, i) => ({
            id: p.playerId,
            name: p.playerName,
            wins: 0,
            isOnline: p.isOnline,
            avatar: 'ðŸ˜Š',
            rank: i + 1,
            earnings: 0,
          }));
          if (mapped.length > 0) set({ onlinePlayers: mapped });
        },
      }
    );

    // â”€â”€ DÃ©marrer le systÃ¨me Realtime des dÃ©fis (Supabase + polling 4s) â”€â”€
    startChallengeRealtime(player.id, {
      // Nouveau dÃ©fi reÃ§u en temps rÃ©el â†’ recharger + notifier
      onNewChallenge: async (challenge) => {
        console.info('[Store] âš”ï¸ DÃ©fi entrant temps rÃ©el:', challenge.fromPlayerName);
        await get().loadChallenges();
        await get().loadOpenChallenges();
        // Notification sonore/visuelle
        if (challenge.fromPlayerId !== player.id) {
          get().addNotification({
            type: 'challenge',
            title: `âš”ï¸ DÃ©fi de ${challenge.fromPlayerName}!`,
            message: `Mise: ${challenge.betAmount.toLocaleString()} ${challenge.currency} â€¢ Plateau ${challenge.boardSize}Ã—${challenge.boardSize} â€¢ ${challenge.pieceCount} pions`,
            fromPlayer: challenge.fromPlayerName,
            matchId: challenge.id,
          });
        }
      },
      // Statut mis Ã  jour (acceptÃ©/annulÃ©/expirÃ©)
      onChallengeUpdate: async (id, status) => {
        await get().loadChallenges();
        await get().loadOpenChallenges();

        const updatedChallenge = await ChallengeService.getById(id);
        const st = get().gameState;
        if (st && st.challengeId === id) {
          const reason =
            status === 'cancelled'
              ? 'Le chat est en lecture seule: ce dÃ©fi a Ã©tÃ© annulÃ©.'
              : status === 'expired'
                ? 'Le chat est en lecture seule: ce dÃ©fi a expirÃ©.'
                : null;
          set({
            gameState: { ...st, challengeStatus: status },
            chatReadOnlyReason: reason,
          });
        }

        if (status === 'accepted') {
          get().addNotification({
            type: 'challenge',
            title: 'âœ… DÃ©fi acceptÃ©!',
            message: 'Votre dÃ©fi a Ã©tÃ© acceptÃ© â€” la partie commence!',
          });

          if (
            updatedChallenge &&
            updatedChallenge.fromPlayerId === player.id &&
            updatedChallenge.gameId &&
            !get().gameState
          ) {
            const acceptor = updatedChallenge.acceptedByPlayerId
              ? await PlayerService.findById(updatedChallenge.acceptedByPlayerId)
              : null;
            const opponentName = acceptor
              ? `${acceptor.firstName} ${acceptor.lastName}`
              : 'Adversaire';
            get().initGame('challenge', {
              matchId: updatedChallenge.gameId,
              challengeId: updatedChallenge.id,
              betAmount: updatedChallenge.betAmount,
              currency: updatedChallenge.currency,
              pieceCount: updatedChallenge.pieceCount,
              boardSize: updatedChallenge.boardSize,
              timePerTurn: updatedChallenge.timePerTurn,
              opponentName,
              playerColor: 'black',
              useVirtual: false,
            });
          }
        }
      },
      // Rechargement complet (polling dÃ©tecte un changement)
      onReload: async () => {
        await get().loadChallenges();
        await get().loadOpenChallenges();
        await get().loadNotifications();
      },
    });

    if (challengeHousekeepingInterval) clearInterval(challengeHousekeepingInterval);
    challengeHousekeepingInterval = setInterval(async () => {
      await ChallengeService.expireChallenges();
      await get().loadChallenges();
      await get().loadOpenChallenges();
    }, 60 * 1000);

    return true;
  },

  register: async (data) => {
    set({ dbLoading: true });
    // VÃ©rification email unique
    const emailExists = await PlayerService.findByEmail(data.email || '');
    if (emailExists) { set({ dbLoading: false }); return 'email_taken'; }
    // VÃ©rification tÃ©lÃ©phone unique
    const phoneExists = await PlayerService.findByPhone(data.phone || '');
    if (phoneExists) { set({ dbLoading: false }); return 'phone_taken'; }

    const player = await PlayerService.create({
      firstName: data.firstName || '',
      lastName: data.name || '',
      phone: data.phone || '',
      email: data.email || '',
      passwordHash: hashPassword(data.password || ''),
      balance: 0,
      virtualBalanceCDF: VIRTUAL_WALLET_CDF,
      virtualBalanceUSD: VIRTUAL_WALLET_USD,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      totalEarnings: 0,
      avatar: ['ðŸ˜Š','ðŸ¦','ðŸ¯','ðŸ¦…','ðŸ¦Š','ðŸ†','ðŸ‘‘','â­'][Math.floor(Math.random() * 8)],
      isOnline: true,
      preferredCurrency: 'CDF',
      role: 'player',
    });
    set({ dbLoading: false });
    if (!player) return 'unknown';
    set({ currentUser: dbPlayerToStore(player), isAuthenticated: true, currentView: 'home' });
    await get().addNotification({
      type: 'system',
      title: 'Bienvenue sur AfroDame',
      message: 'Votre compte a Ã©tÃ© crÃ©Ã© avec succÃ¨s. Vous pouvez maintenant lancer et rejoindre des dÃ©fis en ligne.',
    });
    return null; // null = succÃ¨s
  },

  // â”€â”€ Wallet Virtuel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useVirtualBalance: async (amount: number, currency: Currency) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    const amtCDF = currency === 'USD' ? amount * get().adminSettings.cdfRate : amount;
    const amtUSD = currency === 'CDF' ? amount / get().adminSettings.cdfRate : amount;

    if (currency === 'CDF' && currentUser.virtualBalanceCDF < amtCDF) return false;
    if (currency === 'USD' && currentUser.virtualBalanceUSD < amtUSD) return false;

    const updatedUser: Player = {
      ...currentUser,
      virtualBalanceCDF: currentUser.virtualBalanceCDF - (currency === 'CDF' ? amtCDF : amtCDF),
      virtualBalanceUSD: currentUser.virtualBalanceUSD - (currency === 'USD' ? amtUSD : amtUSD),
    };
    set({ currentUser: updatedUser });
    await PlayerService.update(currentUser.id, {
      virtualBalanceCDF: updatedUser.virtualBalanceCDF,
      virtualBalanceUSD: updatedUser.virtualBalanceUSD,
    });
    return true;
  },

  hasEnoughFunds: (amount: number, currency: Currency, useVirtual = false) => {
    const { currentUser, adminSettings } = get();
    if (!currentUser) return false;
    const amtCDF = currency === 'USD' ? amount * adminSettings.cdfRate : amount;
    if (useVirtual) {
      return currentUser.virtualBalanceCDF >= amtCDF || currentUser.balance >= amtCDF;
    }
    return currentUser.balance >= amtCDF;
  },

  logout: async () => {
    const { currentUser, gameState } = get();
    if (currentUser) await PlayerService.setOnline(currentUser.id, false);
    // DÃ©sabonner de tous les canaux Realtime
    if (gameState) unsubscribeFromMatch(gameState.matchId);
    unsubscribeAll();
    // ArrÃªter le polling et les subscriptions des dÃ©fis
    stopChallengeRealtime();
    if (challengeHousekeepingInterval) {
      clearInterval(challengeHousekeepingInterval);
      challengeHousekeepingInterval = null;
    }
    set({
      currentUser: null,
      isAuthenticated: false,
      currentView: 'home',
      logoClickCount: 0,
      gameState: null,
      realtimeMatchActive: false,
      challenges: [],
      openChallenges: [],
      notifications: [],
      chatReadOnlyReason: null,
    });
  },

  forgotPassword: async (email) => {
    return await PlayerService.sendPasswordReset(email);
  },

  // â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  setCurrentView: (view) => set(s => ({ currentView: view, previousView: s.currentView })),

  handleLogoClick: () => {
    const { logoClickCount } = get();
    const n = logoClickCount + 1;
    if (n >= 5) {
      set({ logoClickCount: 0, currentView: 'admin' });
    } else {
      set({ logoClickCount: n });
      setTimeout(() => set(s => ({ logoClickCount: Math.max(0, s.logoClickCount - 1) })), 3000);
    }
  },

  // â”€â”€ Game â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  initGame: (mode, options = {}) => {
    const { adminSettings, aiDifficulty: storeDiff, currentUser } = get();
    const boardSize = options.boardSize || 10;
    const pieces = initPieces(boardSize, options.pieceCount);
    const timePerTurn = options.timePerTurn || (mode === 'ai' ? adminSettings.aiMatchTime : adminSettings.challengeMatchTime);
    const diff: AIDifficulty = options.aiDiff || storeDiff;
    const matchId = options.matchId || uuidv4();
    const challengeId = options.challengeId || null;
    const useVirtual = options.useVirtual || false;

    // â”€â”€ DÃ©duction de la mise â€” UNE SEULE FOIS dans initGame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // betDeducted sera mis Ã  true IMMÃ‰DIATEMENT aprÃ¨s dÃ©duction
    // abandonGame et makeMove vÃ©rifieront ce flag avant toute opÃ©ration financiÃ¨re
    let betDeducted = false;
    if (mode !== 'ai' && options.betAmount && options.betAmount > 0 && currentUser) {
      const amt = options.betAmount;
      const curr = options.currency || adminSettings.defaultCurrency;
      if (useVirtual) {
        // DÃ©duire du wallet virtuel
        const amtCDF = curr === 'USD' ? amt * adminSettings.cdfRate : amt;
        const newVirt = Math.max(0, currentUser.virtualBalanceCDF - amtCDF);
        const updatedUser = { ...currentUser, virtualBalanceCDF: newVirt };
        set({ currentUser: updatedUser });
        PlayerService.update(currentUser.id, { virtualBalanceCDF: newVirt });
      } else {
        // DÃ©duire du solde rÃ©el
        const newBal = Math.max(0, currentUser.balance - amt);
        const updatedUser = { ...currentUser, balance: newBal };
        set({ currentUser: updatedUser });
        PlayerService.update(currentUser.id, { balance: newBal });
      }
      betDeducted = true; // âœ… Marquer la mise comme dÃ©duite
    }

    // â”€â”€ Attribution des couleurs selon le mode et le rÃ´le â”€â”€
    // En ligne/dÃ©fi : l'Ã©metteur joue 'black' (rouge sur le plateau = adversaire)
    //                 l'acceptant joue 'red'   (convention africaine : red commence)
    // En IA : le joueur humain joue toujours 'black', l'IA joue 'red' (red commence)
    const playerColor: PieceColor = options.playerColor || 'black';

    // âš ï¸ Ne JAMAIS sauvegarder les matchs IA en base de donnÃ©es
    set({
      gameState: {
        pieces,
        currentTurn: 'red',  // 'red' commence toujours (convention africaine)
        selectedPiece: null,
        validMoves: [],
        gameOver: false,
        winner: null,
        mode,
        drawCount: 0,
        matchId,
        challengeId,
        challengeStatus: mode === 'challenge' ? 'accepted' : null,
        betAmount: options.betAmount || 0,
        currency: options.currency || adminSettings.defaultCurrency,
        timePerTurn,
        playerTimeLeft: timePerTurn,
        opponentTimeLeft: timePerTurn,
        boardSize,
        pieceCount: pieces.filter(p => p.color === 'red').length,
        playerColor,
        opponentName: options.opponentName || (mode === 'ai' ? 'Intelligence Artificielle' : 'Adversaire'),
        capturedRed: 0,
        capturedBlack: 0,
        is3D: options.is3D || false,
        playerPieceColor: options.playerPieceColor || '#dc2626',
        opponentPieceColor: options.opponentPieceColor || '#1f2937',
        moveHistory: [],
        consecutiveDraws: 0,
        aiDifficulty: diff,
        // â”€â”€â”€ Flags anti-double-dÃ©duction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        betDeducted,            // true = mise dÃ©jÃ  retirÃ©e du wallet
        useVirtualBet: useVirtual, // true = mise sur wallet virtuel
        financialsSettled: false,  // false = gains/pertes pas encore rÃ©glÃ©s
      },
      currentView: 'game',
      chatReadOnlyReason: null,
    });

    if (mode !== 'ai') {
      void MatchService.update(matchId, {
        boardState: JSON.stringify(pieces),
        status: 'active',
        consecutiveDraws: 0,
        finishedAt: null,
      });
    }

    if (mode === 'ai') {
      setTimeout(() => {
        const st = get().gameState;
        if (!st || st.gameOver) return;
        const aiMv = getAIMove(st.pieces, 'red', st.boardSize, diff, st.consecutiveDraws);
        if (aiMv) get().makeMove(aiMv);
      }, 800);
    }

    // â”€â”€ Initialiser Realtime pour les matchs en ligne/dÃ©fi â”€â”€
    if (mode !== 'ai' && currentUser) {
      const capturedCurrentUser = currentUser;
      const rt = initMatchRealtime(matchId, capturedCurrentUser.id, {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // RÃ‰CEPTION D'UN COUP ADVERSE â€” VALIDATION ANTI-TRICHE OBLIGATOIRE
        // Le coup reÃ§u est validÃ© INDÃ‰PENDAMMENT avant d'Ãªtre appliquÃ©
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        onMove: (rtMove: RealtimeMove) => {
          const st = get().gameState;
          if (!st || st.gameOver) return;
          // Ignorer si c'est notre propre coup rebondissant
          if (rtMove.playerId === capturedCurrentUser.id) return;
          // Ignorer si ce n'est pas le tour de l'adversaire
          if (st.currentTurn === st.playerColor) return;

          // â”€â”€ DÃ©terminer la couleur de l'expÃ©diteur â”€â”€
          const senderColor = st.playerColor === 'red' ? 'black' : 'red';

          // â”€â”€ Contexte de validation â”€â”€
          const ctx: MoveValidationContext = {
            currentPieces: st.pieces,
            boardSize: st.boardSize,
            currentTurn: st.currentTurn,
            senderColor,
            matchId: st.matchId,
            boardHash: rtMove.boardHash,
          };

          // â”€â”€ Valider le coup reÃ§u â”€â”€
          const validatedMove = {
            move: {
              fromRow: rtMove.fromRow,
              fromCol: rtMove.fromCol,
              toRow: rtMove.toRow,
              toCol: rtMove.toCol,
              capturedPieces: rtMove.capturedPieces,
            },
            playerId: rtMove.playerId,
            matchId: rtMove.matchId,
            timestamp: rtMove.timestamp,
            nonce: rtMove.nonce ?? `fallback-${Date.now()}-${Math.random()}`,
            boardHash: rtMove.boardHash ?? hashBoard(st.pieces),
            signature: rtMove.signature ?? '',
          };

          const result = validateReceivedMove(validatedMove, ctx);

          if (!result.valid) {
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // COUP INVALIDE â€” TENTATIVE DE TRICHE DÃ‰TECTÃ‰E
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            console.error(`[AntiCheat] ðŸš¨ Coup invalide reÃ§u:`, result.reason);

            reportCheat(
              st.matchId,
              rtMove.playerId,
              st.opponentName,
              validatedMove.move,
              result.reason ?? 'Coup invalide',
              st.pieces,
            );

            const suspicion = incrementSuspicion(rtMove.playerId);

            if (suspicion === 'banned') {
              // Joueur banni â€” dÃ©clarÃ© perdant
              get().addNotification({
                type: 'system',
                title: 'ðŸš« Triche dÃ©tectÃ©e!',
                message: `L'adversaire a tentÃ© de tricher. Vous Ãªtes dÃ©clarÃ© vainqueur!`,
              });
              set({
                gameState: {
                  ...st,
                  gameOver: true,
                  winner: st.playerColor,
                },
              });
              unsubscribeFromMatch(st.matchId);
            } else if (suspicion === 'warning') {
              get().addNotification({
                type: 'system',
                title: 'âš ï¸ Comportement suspect',
                message: `Des coups invalides ont Ã©tÃ© dÃ©tectÃ©s. L'adversaire est sous surveillance.`,
              });
            }
            return; // Refuser d'appliquer le coup invalide
          }

          // âœ… COUP VALIDE â€” appliquer directement sans re-validation
          // Utiliser makeMove en mode "adversaire" (bypass de la vÃ©rification de couleur)
          get().makeMove({
            fromRow: rtMove.fromRow,
            fromCol: rtMove.fromCol,
            toRow: rtMove.toRow,
            toCol: rtMove.toCol,
            capturedPieces: rtMove.capturedPieces,
          });
        },
        // Ã‰tat complet du match reÃ§u (rÃ©conciliation)
        onMatchState: (state: MatchStateSync) => {
          const st = get().gameState;
          if (!st || st.matchId !== state.matchId) return;
          if (state.gameOver && !st.gameOver) {
            set({
              gameState: { ...st, gameOver: true, winner: state.winner },
              chatReadOnlyReason: 'Le chat est en lecture seule: la partie est terminÃ©e.',
            });
          }
        },
        // Message de chat reÃ§u en temps rÃ©el
        onChatMessage: (msg: RealtimeChatMessage) => {
          const newMsg: ChatMessage = {
            id: msg.id,
            senderId: msg.senderId,
            senderName: msg.senderName,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          };
          set(s => ({
            chatMessages: [...s.chatMessages, newMsg],
            unreadMessages: s.chatOpen ? 0 : s.unreadMessages + 1,
          }));
        },
        // Adversaire a quittÃ©
        onOpponentLeft: () => {
          const st = get().gameState;
          if (!st || st.gameOver) return;
          get().addNotification({
            type: 'system',
            title: 'âš ï¸ Adversaire dÃ©connectÃ©',
            message: 'Votre adversaire a quittÃ© la partie. Vous Ãªtes dÃ©clarÃ© vainqueur!',
          });
          set({
            gameState: { ...st, gameOver: true, winner: st.playerColor },
            chatReadOnlyReason: 'Le chat est en lecture seule: la partie est terminÃ©e.',
          });
          unsubscribeFromMatch(matchId);
        },
      });
      rt.then((active) => set({ realtimeMatchActive: active }));
    }
  },

  selectPiece: (piece) => {
    const { gameState, currentUser } = get();
    if (!gameState || gameState.gameOver) return;
    if (gameState.mode === 'challenge' && gameState.challengeStatus !== 'accepted') return;
    if (piece.color !== gameState.currentTurn) return;

    // â”€â”€ Restriction en ligne / dÃ©fi : chaque joueur ne contrÃ´le QUE ses pions â”€â”€
    // En mode 'ai' : seul le joueur humain joue (playerColor)
    // En mode 'online'/'challenge' : chaque joueur contrÃ´le uniquement sa couleur (playerColor)
    if (gameState.mode === 'ai') {
      // Bloquer si ce n'est pas le tour du joueur humain
      if (gameState.currentTurn !== gameState.playerColor) return;
    } else {
      // En ligne/dÃ©fi : vÃ©rifier que le joueur courant contrÃ´le bien ce pion
      // Le joueur qui a crÃ©Ã© la session contrÃ´le playerColor
      // On identifie le joueur par currentUser
      if (!currentUser) return;
      // Seuls les pions de la couleur assignÃ©e au joueur courant sont jouables
      if (piece.color !== gameState.playerColor) return;
      // Bloquer si ce n'est pas le tour du joueur
      if (gameState.currentTurn !== gameState.playerColor) return;
    }

    const mandatory = hasMandatoryCapture(gameState.pieces, piece.color, gameState.boardSize);
    let validMoves = getValidMoves(piece, gameState.pieces, gameState.boardSize);
    if (mandatory) validMoves = validMoves.filter(m => m.capturedPieces && m.capturedPieces.length > 0);
    set({ gameState: { ...gameState, selectedPiece: piece, validMoves } });
  },

  makeMove: (move) => {
    const { gameState, adminSettings, currentUser } = get();
    if (!gameState || gameState.gameOver) return;
    if (gameState.mode === 'challenge' && gameState.challengeStatus !== 'accepted') return;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // VALIDATION OBLIGATOIRE dans makeMove â€” IMPOSSIBLE Ã€ CONTOURNER
    // MÃªme si selectPiece est bypassÃ© (console DevTools, appel direct, triche),
    // makeMove RECALCULE et VÃ‰RIFIE la lÃ©galitÃ© du coup de faÃ§on indÃ©pendante.
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â”€â”€ 1. VÃ©rifier que la piÃ¨ce existe sur le plateau â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const movingPiece = gameState.pieces.find(
      p => p.row === move.fromRow && p.col === move.fromCol
    );
    if (!movingPiece) {
      console.error(`[MoveValidator] âŒ Aucun pion en (${move.fromRow},${move.fromCol}) â€” coup rejetÃ©`);
      return;
    }

    // â”€â”€ 2. VÃ©rifier que c'est bien le tour de la couleur qui joue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (movingPiece.color !== gameState.currentTurn) {
      console.error(`[MoveValidator] âŒ Ce n'est pas le tour de ${movingPiece.color} â€” coup rejetÃ©`);
      return;
    }

    // â”€â”€ 3. En mode en ligne/dÃ©fi : vÃ©rifier que le joueur ne joue PAS les pions adverses â”€â”€
    // (l'IA et le mode adversaire en ligne passent cette vÃ©rification via leur couleur)
    if (gameState.mode !== 'ai' && currentUser) {
      // Le joueur local ne peut jouer QUE sa couleur assignÃ©e
      if (movingPiece.color !== gameState.playerColor) {
        console.error(`[MoveValidator] âŒ Tentative de jouer les pions adverses (${movingPiece.color}) â€” coup rejetÃ©`);
        return;
      }
    }

    // â”€â”€ 4. VÃ©rifier la destination dans les bornes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (
      move.toRow < 0 || move.toRow >= gameState.boardSize ||
      move.toCol < 0 || move.toCol >= gameState.boardSize
    ) {
      console.error(`[MoveValidator] âŒ Destination (${move.toRow},${move.toCol}) hors plateau â€” coup rejetÃ©`);
      return;
    }

    // â”€â”€ 5. VÃ©rifier que la destination est libre â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const destOccupied = gameState.pieces.find(
      p => p.row === move.toRow && p.col === move.toCol
    );
    if (destOccupied) {
      console.error(`[MoveValidator] âŒ Destination (${move.toRow},${move.toCol}) occupÃ©e â€” coup rejetÃ©`);
      return;
    }

    // â”€â”€ 6. Recalculer indÃ©pendamment les coups valides pour ce pion â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const computedValidMoves = getValidMoves(movingPiece, gameState.pieces, gameState.boardSize);

    // â”€â”€ 7. VÃ©rifier la rÃ¨gle de capture obligatoire (globale) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Si UNE capture est disponible pour n'importe quel pion de la couleur courante,
    // le joueur DOIT capturer â€” il ne peut pas faire un simple dÃ©placement.
    const mandatoryCapture = hasMandatoryCapture(
      gameState.pieces,
      movingPiece.color,
      gameState.boardSize
    );

    const allowedMoves = mandatoryCapture
      ? computedValidMoves.filter(m => m.capturedPieces && m.capturedPieces.length > 0)
      : computedValidMoves;

    // â”€â”€ 8. VÃ©rifier que le coup demandÃ© est dans la liste des coups autorisÃ©s â”€
    const isLegal = allowedMoves.some(
      vm => vm.toRow === move.toRow && vm.toCol === move.toCol
    );

    if (!isLegal) {
      // Diagnostiquer pourquoi le coup est illÃ©gal
      const allMovesForPiece = getValidMoves(movingPiece, gameState.pieces, gameState.boardSize);
      const isInAllMoves = allMovesForPiece.some(vm => vm.toRow === move.toRow && vm.toCol === move.toCol);

      if (mandatoryCapture && isInAllMoves) {
        console.error(`[MoveValidator] âŒ CAPTURE OBLIGATOIRE ignorÃ©e â€” le joueur doit manger`);
      } else {
        // VÃ©rifier si c'est un retour arriÃ¨re sans capture
        const isBackward = movingPiece.color === 'red'
          ? move.toRow < move.fromRow
          : move.toRow > move.fromRow;
        if (isBackward && !movingPiece.isKing) {
          console.error(`[MoveValidator] âŒ RETOUR ARRIÃˆRE sans capture â€” interdit pour les pions normaux`);
        } else {
          console.error(`[MoveValidator] âŒ Coup illÃ©gal (${move.fromRow},${move.fromCol})â†’(${move.toRow},${move.toCol}) â€” non dans les coups valides`);
        }
      }
      return; // â† REJET DU COUP â€” rien n'est modifiÃ©
    }

    // â”€â”€ 9. VÃ©rifier les piÃ¨ces capturÃ©es dÃ©clarÃ©es (si capture) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Utiliser les captures calculÃ©es localement (source de vÃ©ritÃ©),
    // pas celles envoyÃ©es par le client potentiellement tricheur.
    const localMatchingMove = allowedMoves.find(
      vm => vm.toRow === move.toRow && vm.toCol === move.toCol
    );
    // Remplacer les capturedPieces dÃ©clarÃ©es par celles calculÃ©es localement
    const verifiedMove: Move = {
      ...move,
      capturedPieces: localMatchingMove?.capturedPieces ?? move.capturedPieces,
    };

    // âœ… COUP VALIDÃ‰ â€” Application sur le plateau
    let newPieces = gameState.pieces.map(p => ({ ...p }));
    if (verifiedMove.capturedPieces) {
      newPieces = newPieces.filter(p => !verifiedMove.capturedPieces!.find(c => c.row === p.row && c.col === p.col));
    }
    const mp = newPieces.find(p => p.row === verifiedMove.fromRow && p.col === verifiedMove.fromCol);
    if (!mp) return;
    mp.row = verifiedMove.toRow; mp.col = verifiedMove.toCol;
    if (mp.color === 'red' && mp.row === gameState.boardSize-1) mp.isKing = true;
    if (mp.color === 'black' && mp.row === 0) mp.isKing = true;

    const capturedRed = gameState.capturedRed + (verifiedMove.capturedPieces?.filter(c => {
      const p = gameState.pieces.find(pp => pp.row === c.row && pp.col === c.col);
      return p?.color === 'red';
    }).length || 0);
    const capturedBlack = gameState.capturedBlack + (verifiedMove.capturedPieces?.filter(c => {
      const p = gameState.pieces.find(pp => pp.row === c.row && pp.col === c.col);
      return p?.color === 'black';
    }).length || 0);

    const nextTurn: PieceColor = gameState.currentTurn === 'red' ? 'black' : 'red';
    const { over, winner } = checkGameOver(newPieces, nextTurn, gameState.boardSize, gameState.consecutiveDraws);

    if (over && currentUser) {
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
      // GARDE ANTI-DOUBLE-RÃˆGLEMENT FINANCIER
      // financialsSettled garantit qu'on ne rÃ¨gle les finances QU'UNE SEULE FOIS
      // mÃªme si makeMove est appelÃ© plusieurs fois en fin de partie
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
      if (gameState.financialsSettled) {
        console.warn('[Finance] âš ï¸ RÃ¨glement dÃ©jÃ  effectuÃ© â€” double appel ignorÃ©');
        return;
      }

      if (gameState.mode === 'ai') {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // MATCH IA : SUPPRESSION IMMÃ‰DIATE â€” aucune trace conservÃ©e
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        MatchService.deleteFinished(gameState.matchId);
        ChatService.deleteByMatch(gameState.matchId);
        if (winner === gameState.playerColor) {
          get().addNotification({ type: 'win', title: 'Victoire vs IA! ðŸ†', message: `Vous avez battu l'IA (${gameState.aiDifficulty}) â€” Partie gratuite` });
        } else if (winner && winner !== 'draw') {
          get().addNotification({ type: 'loss', title: 'DÃ©faite vs IA', message: `L'IA (${gameState.aiDifficulty}) vous a battu â€” RÃ©essayez!` });
        } else {
          get().addNotification({ type: 'system', title: 'Match nul vs IA ðŸ¤', message: 'Ã‰galitÃ© parfaite contre l\'IA!' });
        }

      } else if (gameState.betAmount > 0 && gameState.betDeducted) {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // MATCH EN LIGNE / DÃ‰FI PAYANT
        // betDeducted = true â†’ mise dÃ©jÃ  retirÃ©e dans initGame
        // On calcule et verse UNIQUEMENT les gains ici (jamais une 2e dÃ©duction)
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const feeRate = adminSettings.platformFee / 100;
        const totalFees = gameState.betAmount * feeRate * 2; // 2% Ã— 2 joueurs
        const prize = gameState.betAmount * 2 - totalFees;   // gain net du gagnant
        const isVirtual = gameState.useVirtualBet;           // flag fiable depuis initGame

        if (winner === gameState.playerColor) {
          // âœ… VICTOIRE â€” crÃ©diter les gains (mise adversaire - frais)
          if (isVirtual) {
            const newVirt = (currentUser.virtualBalanceCDF) + prize;
            const updatedUser = {
              ...currentUser,
              virtualBalanceCDF: newVirt,
              totalWins: currentUser.totalWins + 1,
            };
            set({ currentUser: updatedUser });
            PlayerService.update(currentUser.id, {
              virtualBalanceCDF: newVirt,
              totalWins: updatedUser.totalWins,
            });
            get().addNotification({
              type: 'win', title: 'ðŸ† Victoire! (Virtuel)',
              message: `+${prize.toLocaleString()} ${gameState.currency} virtuels crÃ©ditÃ©s!`,
              amount: prize,
            });
            // Gains virtuels â†’ jamais de commission admin
          } else {
            // CrÃ©diter le gain rÃ©el (updateBalance ajoute, pas soustrait)
            get().updateBalance(
              prize,
              'win',
              `Victoire â€” gain net: ${prize.toLocaleString()} ${gameState.currency}`,
              gameState.currency
            );
            get().addNotification({
              type: 'win', title: 'ðŸ† Victoire!',
              message: `+${prize.toLocaleString()} ${gameState.currency} crÃ©ditÃ©s sur votre wallet!`,
              amount: prize,
            });
            // âœ… Commission admin sur matchs rÃ©els UNIQUEMENT
            if (totalFees > 0) {
              AdminWalletService.collectFee(totalFees, gameState.currency, gameState.matchId);
            }
          }
        } else if (winner && winner !== 'draw') {
          // âŒ DÃ‰FAITE â€” mise dÃ©jÃ  dÃ©duite dans initGame, on enregistre juste la stat
          if (isVirtual) {
            const updatedUser = { ...currentUser, totalLosses: currentUser.totalLosses + 1 };
            set({ currentUser: updatedUser });
            PlayerService.update(currentUser.id, { totalLosses: updatedUser.totalLosses });
            get().addNotification({
              type: 'loss', title: 'DÃ©faite (Virtuel)',
              message: `Mise de ${gameState.betAmount.toLocaleString()} ${gameState.currency} virtuels perdue`,
              amount: gameState.betAmount,
            });
            // Pas de commission admin sur wallet virtuel
          } else {
            // Mise dÃ©jÃ  dÃ©duite â†’ juste enregistrer la transaction de perte et les stats
            const newBal = currentUser.balance; // balance dÃ©jÃ  Ã  jour (dÃ©duit dans initGame)
            const updatedUser = {
              ...currentUser,
              totalLosses: currentUser.totalLosses + 1,
            };
            set({ currentUser: updatedUser });
            PlayerService.update(currentUser.id, {
              balance: newBal,
              totalLosses: updatedUser.totalLosses,
            });
            // Transaction de perte pour l'historique wallet
            TransactionService.create({
              playerId: currentUser.id,
              type: 'loss',
              amount: gameState.betAmount,
              currency: gameState.currency,
              description: `DÃ©faite â€” mise perdue: ${gameState.betAmount.toLocaleString()} ${gameState.currency}`,
              status: 'completed',
              method: null,
            });
            get().addNotification({
              type: 'loss', title: 'DÃ©faite',
              message: `Mise de ${gameState.betAmount.toLocaleString()} ${gameState.currency} perdue`,
              amount: gameState.betAmount,
            });
            // Commission admin sur match rÃ©el (mÃªme en cas de dÃ©faite)
            if (totalFees > 0) {
              AdminWalletService.collectFee(totalFees, gameState.currency, gameState.matchId);
            }
          }
        } else if (winner === 'draw') {
          // ðŸ¤ MATCH NUL â€” restituer la mise (sans frais)
          if (isVirtual) {
            const updatedUser = {
              ...currentUser,
              virtualBalanceCDF: currentUser.virtualBalanceCDF + gameState.betAmount,
              totalDraws: currentUser.totalDraws + 1,
            };
            set({ currentUser: updatedUser });
            PlayerService.update(currentUser.id, {
              virtualBalanceCDF: updatedUser.virtualBalanceCDF,
              totalDraws: updatedUser.totalDraws,
            });
          } else {
            // Rembourser la mise en cas de nul (sans frais de plateforme)
            get().updateBalance(
              gameState.betAmount,
              'win',
              `Match nul â€” mise remboursÃ©e: ${gameState.betAmount.toLocaleString()} ${gameState.currency}`,
              gameState.currency
            );
          }
          get().addNotification({
            type: 'system', title: 'ðŸ¤ Match nul',
            message: `Votre mise de ${gameState.betAmount.toLocaleString()} ${gameState.currency} est remboursÃ©e.`,
          });
        }

        // Suppression de l'historique du match en ligne aprÃ¨s fin
        MatchService.deleteFinished(gameState.matchId);
        ChatService.deleteByMatch(gameState.matchId);

      } else if (gameState.betAmount === 0 || !gameState.betDeducted) {
        // Match sans mise â€” pas de rÃ¨glement financier, juste notification
        if (winner === gameState.playerColor) {
          get().addNotification({ type: 'win', title: 'ðŸ† Victoire!', message: 'Vous avez gagnÃ© ce match!' });
        } else if (winner && winner !== 'draw') {
          get().addNotification({ type: 'loss', title: 'DÃ©faite', message: 'Vous avez perdu ce match.' });
        } else {
          get().addNotification({ type: 'system', title: 'ðŸ¤ Match nul', message: 'Ã‰galitÃ©!' });
        }
        MatchService.deleteFinished(gameState.matchId);
        ChatService.deleteByMatch(gameState.matchId);
      }
    }

    const newConsecDraws = winner === 'draw' ? gameState.consecutiveDraws + 1 : 0;
    const movePlayerType: 'human' | 'ai' =
      gameState.mode === 'ai' && movingPiece.color !== gameState.playerColor ? 'ai' : 'human';

    void MatchMoveService.create({
      matchId: gameState.matchId,
      moveNumber: gameState.moveHistory.length + 1,
      fromRow: verifiedMove.fromRow,
      fromCol: verifiedMove.fromCol,
      toRow: verifiedMove.toRow,
      toCol: verifiedMove.toCol,
      capturedPieces: verifiedMove.capturedPieces || [],
      playerType: movePlayerType,
    });

    if (gameState.mode !== 'ai') {
      void MatchService.update(gameState.matchId, {
        boardState: JSON.stringify(newPieces),
        consecutiveDraws: newConsecDraws,
        status: over ? 'finished' : 'active',
        finishedAt: over ? new Date().toISOString() : null,
      });
    }

    set({
      gameState: {
        ...gameState,
        pieces: newPieces,
        currentTurn: nextTurn,
        selectedPiece: null,
        validMoves: [],
        gameOver: over,
        winner,
        capturedRed,
        capturedBlack,
        playerTimeLeft: gameState.timePerTurn,
        moveHistory: [...gameState.moveHistory, verifiedMove],
        consecutiveDraws: newConsecDraws,
        // âœ… Marquer les finances comme rÃ©glÃ©es si la partie est terminÃ©e
        // EmpÃªche tout double appel financier si makeMove est rappelÃ©
        financialsSettled: over ? true : gameState.financialsSettled,
      },
    });
    if (over && gameState.mode !== 'ai') {
      set({ chatReadOnlyReason: 'Le chat est en lecture seule: la partie est terminÃ©e.' });
    }

    // â”€â”€ Broadcaster le coup via Supabase Realtime (mode en ligne/dÃ©fi) â”€â”€
    if (gameState.mode !== 'ai' && currentUser) {
      // âœ… CrÃ©er un coup signÃ© (anti-triche) â€” avec les donnÃ©es VÃ‰RIFIÃ‰ES localement
      const validatedMoveData = createValidatedMove(
        verifiedMove,           // â† coup vÃ©rifiÃ© localement (pas celui reÃ§u)
        currentUser.id,
        gameState.matchId,
        gameState.pieces,       // plateau AVANT le coup (pour le hash)
      );

      // Broadcaster le coup signÃ© vers l'adversaire
      broadcastMove(gameState.matchId, {
        matchId: gameState.matchId,
        playerId: currentUser.id,
        fromRow: verifiedMove.fromRow,
        fromCol: verifiedMove.fromCol,
        toRow: verifiedMove.toRow,
        toCol: verifiedMove.toCol,
        capturedPieces: verifiedMove.capturedPieces, // â† captures VÃ‰RIFIÃ‰ES
        timestamp: validatedMoveData.timestamp,
        // Champs anti-triche
        nonce: validatedMoveData.nonce,
        boardHash: validatedMoveData.boardHash,
        signature: validatedMoveData.signature,
      } as RealtimeMove);

      // Broadcaster l'Ã©tat complet pour rÃ©conciliation
      broadcastMatchState(gameState.matchId, {
        matchId: gameState.matchId,
        playerId: currentUser.id,
        boardState: JSON.stringify(newPieces),
        currentTurn: nextTurn,
        consecutiveDraws: newConsecDraws,
        gameOver: over,
        winner: winner,
        timestamp: new Date().toISOString(),
      } as MatchStateSync);

      // DÃ©sabonner si la partie est terminÃ©e
      if (over) {
        setTimeout(() => unsubscribeFromMatch(gameState.matchId), 3000);
        set({ realtimeMatchActive: false });
      }
    }

    if (!over && gameState.mode === 'ai' && nextTurn !== gameState.playerColor) {
      const delay = { facile: 500, moyen: 800, difficile: 1100 }[gameState.aiDifficulty] || 800;
      setTimeout(() => {
        const st = get().gameState;
        if (!st || st.gameOver) return;
        const aiColor: PieceColor = st.playerColor === 'red' ? 'black' : 'red';
        const aiMv = getAIMove(st.pieces, aiColor, st.boardSize, st.aiDifficulty, st.consecutiveDraws);
        if (aiMv) get().makeMove(aiMv);
      }, delay + Math.random() * 300);
    }

  },

  aiMove: () => {
    const { gameState } = get();
    if (!gameState) return;
    const aiColor: PieceColor = gameState.playerColor === 'red' ? 'black' : 'red';
    const mv = getAIMove(gameState.pieces, aiColor, gameState.boardSize, gameState.aiDifficulty, gameState.consecutiveDraws);
    if (mv) get().makeMove(mv);
  },

  // â”€â”€ Chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addChatMessage: async (content) => {
    const { currentUser, chatMessages, gameState, realtimeMatchActive, chatReadOnlyReason } = get();
    if (!currentUser) return;
    if (!content.trim()) return;

    if (gameState && gameState.mode !== 'ai') {
      let reason = chatReadOnlyReason;
      if (!reason && gameState.gameOver) {
        reason = 'Le chat est en lecture seule: la partie est terminÃ©e.';
      }
      if (!reason && (gameState.challengeStatus === 'cancelled' || gameState.challengeStatus === 'expired')) {
        reason = gameState.challengeStatus === 'cancelled'
          ? 'Le chat est en lecture seule: ce dÃ©fi a Ã©tÃ© annulÃ©.'
          : 'Le chat est en lecture seule: ce dÃ©fi a expirÃ©.';
      }

      if (reason) {
        set((s) => {
          if (s.chatMessages.find(m => m.senderId === 'system' && m.content === reason)) {
            return { chatReadOnlyReason: reason };
          }
          return {
            chatReadOnlyReason: reason,
            chatMessages: [
              ...s.chatMessages,
              {
                id: uuidv4(),
                senderId: 'system',
                senderName: 'SystÃ¨me',
                content: reason,
                timestamp: new Date(),
              },
            ],
          };
        });
        return;
      }
    }

    const msgId = uuidv4();
    const senderName = `${currentUser.firstName} ${currentUser.name}`;
    const msg: ChatMessage = {
      id: msgId,
      senderId: currentUser.id,
      senderName,
      content,
      timestamp: new Date(),
    };
    set({ chatMessages: [...chatMessages, msg] });

    if (!gameState) return;

    const chatData: RealtimeChatMessage = {
      id: msgId,
      matchId: gameState.matchId,
      senderId: currentUser.id,
      senderName,
      content,
      createdAt: new Date().toISOString(),
    };

    if (realtimeMatchActive) {
      // âœ… Mode Realtime : broadcaster via Supabase Channel (instantanÃ©)
      await broadcastChatMessage(gameState.matchId, chatData);
    }

    // Sauvegarder en DB pour persistance (mode online/challenge uniquement)
    if (gameState.mode !== 'ai') {
      try {
        await ChatService.create({
          matchId: gameState.matchId,
          senderId: currentUser.id,
          senderName,
          content,
        });
      } catch (error) {
        const e = error as { message?: string };
        const reason = e.message || 'Le chat est en lecture seule pour cette partie.';
        set((s) => ({
          chatReadOnlyReason: reason,
          chatMessages: [
            ...s.chatMessages,
            {
              id: uuidv4(),
              senderId: 'system',
              senderName: 'SystÃ¨me',
              content: reason,
              timestamp: new Date(),
            },
          ],
        }));
      }
    }

    // Polling de secours uniquement si Realtime non actif
    if (!realtimeMatchActive && gameState.mode !== 'ai') {
      get().pollChatMessages();
    }
  },

  // Polling des messages chat (fallback si Realtime indisponible)
  pollChatMessages: async () => {
    const { gameState, currentUser } = get();
    if (!gameState || !currentUser || gameState.mode === 'ai') return;

    // Charger les messages depuis la DB locale
    const dbMessages = await ChatService.getByMatch(gameState.matchId);
    const storeMessages = get().chatMessages;

    // Ajouter uniquement les nouveaux messages de l'adversaire
    const newMessages = dbMessages.filter(dm =>
      dm.senderId !== currentUser.id &&
      !storeMessages.find(sm => sm.id === dm.id)
    );

    if (newMessages.length > 0) {
      const converted: ChatMessage[] = newMessages.map(m => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      set(s => ({
        chatMessages: [...s.chatMessages, ...converted],
        unreadMessages: s.chatOpen ? 0 : s.unreadMessages + converted.length,
      }));
    }
  },

  toggleChat: () => set(s => ({ chatOpen: !s.chatOpen, unreadMessages: !s.chatOpen ? 0 : s.unreadMessages })),

  // â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addNotification: async (notif) => {
    const { currentUser } = get();
    const newNotif: Notification = { ...notif, id: uuidv4(), timestamp: new Date(), read: false };
    set(s => ({ notifications: [newNotif, ...s.notifications] }));

    if (currentUser) {
      await NotificationService.create({
        playerId: currentUser.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        fromPlayer: notif.fromPlayer || null,
        amount: notif.amount || null,
        matchId: notif.matchId || null,
      });
    }
  },

  markNotificationsRead: async () => {
    const { currentUser } = get();
    set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })), unreadMessages: 0 }));
    if (currentUser) await NotificationService.markAllRead(currentUser.id);
  },

  loadNotifications: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    const notifs = await NotificationService.getByPlayer(currentUser.id);
    set({ notifications: notifs.map(dbNotificationToStore) });
  },

  // â”€â”€ Wallet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  updateBalance: async (amount, type, description, currency = 'CDF') => {
    const { currentUser } = get();
    if (!currentUser) return;
    const newBalance = Math.max(0, currentUser.balance + amount);
    const updatedUser: Player = {
      ...currentUser,
      balance: newBalance,
      totalWins: type === 'win' ? currentUser.totalWins + 1 : currentUser.totalWins,
      totalLosses: type === 'loss' ? currentUser.totalLosses + 1 : currentUser.totalLosses,
      totalEarnings: type === 'win' ? currentUser.totalEarnings + amount : currentUser.totalEarnings,
    };
    set({ currentUser: updatedUser });

    // Save to DB
    await PlayerService.update(currentUser.id, {
      balance: newBalance,
      totalWins: updatedUser.totalWins,
      totalLosses: updatedUser.totalLosses,
      totalEarnings: updatedUser.totalEarnings,
    });
    await TransactionService.create({
      playerId: currentUser.id,
      type,
      amount,
      currency,
      description,
      status: 'completed',
      method: null,
    });
    // Reload transactions
    await get().loadTransactions();
  },

  deposit: async (amount, method, currency) => {
    await get().updateBalance(amount, 'deposit', `DÃ©pÃ´t via ${method}`, currency);
    get().addNotification({ type: 'deposit', title: 'DÃ©pÃ´t rÃ©ussi âœ…', message: `${amount.toLocaleString()} ${currency} ajoutÃ©s Ã  votre wallet`, amount });
  },

  withdraw: async (amount, method, currency) => {
    const { currentUser } = get();
    if (!currentUser || currentUser.balance < amount) return;
    await get().updateBalance(-amount, 'withdraw', `Retrait via ${method}`, currency);
    get().addNotification({ type: 'withdraw', title: 'Retrait en cours â³', message: `${amount.toLocaleString()} ${currency} en cours de traitement`, amount });
  },

  loadTransactions: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    const txs = await TransactionService.getByPlayer(currentUser.id);
    set({ transactions: txs.map(dbTransactionToStore) });
  },

  // â”€â”€ Challenges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  sendChallenge: async (toPlayer, betAmount, currency, pieceCount, boardSize, timePerTurn, useVirtual = false, playerPieceColor?, opponentPieceColor?, is3D?) => {
    const { currentUser, adminSettings } = get();
    if (!currentUser) return;

    const amtCDF = currency === 'USD' ? betAmount * adminSettings.cdfRate : betAmount;
    if (useVirtual) {
      if (currentUser.virtualBalanceCDF < amtCDF) return;
    } else if (currentUser.balance < amtCDF) {
      return;
    }

    const challenge = await ChallengeService.create({
      fromPlayerId: currentUser.id,
      toPlayerId: toPlayer?.id || null,
      fromPlayerName: `${currentUser.firstName} ${currentUser.name}`,
      betAmount,
      currency,
      pieceCount,
      boardSize,
      timePerTurn,
    });
    const storeChallenge = dbChallengeToStore(challenge);
    set(s => ({ challenges: [storeChallenge, ...s.challenges] }));

    get().addNotification({
      type: 'challenge',
      title: 'âš”ï¸ DÃ©fi envoyÃ©',
      message: toPlayer
        ? `DÃ©fi envoyÃ© Ã  ${toPlayer.name}. En attente dâ€™acceptation.`
        : 'DÃ©fi public publiÃ©. En attente dâ€™un adversaire.',
      fromPlayer: toPlayer?.name,
      matchId: challenge.id,
    });

    if (toPlayer) {
      await NotificationService.create({
        playerId: toPlayer.id,
        type: 'challenge',
        title: `âš”ï¸ DÃ©fi de ${currentUser.firstName} ${currentUser.name}`,
        message: `Mise: ${betAmount.toLocaleString()} ${currency} â€¢ ${boardSize}Ã—${boardSize} â€¢ ${pieceCount} pions â€¢ ${timePerTurn}s/tour`,
        fromPlayer: `${currentUser.firstName} ${currentUser.name}`,
        amount: betAmount,
        matchId: challenge.id,
      });
      await broadcastChallenge(toPlayer.id, challenge);
    }

    await get().loadChallenges();
    await get().loadOpenChallenges();

    void playerPieceColor; void opponentPieceColor; void is3D;
  },

  acceptChallenge: async (challengeId) => {
    const { challenges, openChallenges, currentUser, adminSettings } = get();
    const challenge = [...challenges, ...openChallenges].find(c => c.id === challengeId);
    if (!challenge || !currentUser) return;

    const amtCDF = challenge.currency === 'USD'
      ? challenge.betAmount * adminSettings.cdfRate
      : challenge.betAmount;

    const hasReal = currentUser.balance >= amtCDF;
    const hasVirtual = currentUser.virtualBalanceCDF >= amtCDF;
    if (!hasReal && !hasVirtual) {
      get().addNotification({
        type: 'system',
        title: 'Solde insuffisant',
        message: `Vous n'avez pas assez de fonds pour accepter ce défi. Mise requise: ${challenge.betAmount.toLocaleString()} ${challenge.currency}.`,
      });
      return;
    }

    const useVirtual = !hasReal && hasVirtual;

    try {
      const result = await ChallengeService.acceptAtomic(challengeId, currentUser.id);

      await get().loadChallenges();
      await get().loadOpenChallenges();

      await broadcastChallengeUpdate(challenge.fromPlayerId, challengeId, 'accepted');

      get().addNotification({
        type: 'challenge',
        title: 'Défi accepté',
        message: `Vous avez accepté le défi de ${challenge.fromPlayer}. La partie démarre.`,
        fromPlayer: challenge.fromPlayer,
        matchId: result.game.id,
      });

      get().initGame('challenge', {
        matchId: result.game.id,
        challengeId: result.challenge.id,
        betAmount: challenge.betAmount,
        currency: challenge.currency,
        pieceCount: challenge.pieceCount,
        boardSize: challenge.boardSize,
        timePerTurn: challenge.timePerTurn,
        opponentName: challenge.fromPlayer,
        playerColor: 'red',
        useVirtual,
      });
    } catch (error) {
      const e = error as { message?: string };
      get().addNotification({
        type: 'system',
        title: "Impossible d'accepter le défi",
        message: e.message || "Ce défi n'est plus disponible.",
      });
      await get().loadChallenges();
      await get().loadOpenChallenges();
    }
  },

  declineChallenge: async (challengeId) => {
    await get().cancelChallenge(challengeId);
  },

  cancelChallenge: async (challengeId) => {
    const { currentUser, challenges } = get();
    if (!currentUser) return;
    const challenge = challenges.find(c => c.id === challengeId) || null;
    const cancelled = await ChallengeService.cancel(challengeId, currentUser.id);
    if (!cancelled) return;

    if (challenge && challenge.fromPlayerId !== currentUser.id) {
      await broadcastChallengeUpdate(challenge.fromPlayerId, challengeId, 'cancelled');
    }
    if (challenge && challenge.toPlayerId && challenge.toPlayerId !== currentUser.id) {
      await broadcastChallengeUpdate(challenge.toPlayerId, challengeId, 'cancelled');
    }

    await get().loadChallenges();
    await get().loadOpenChallenges();

    const st = get().gameState;
    if (st && st.challengeId === challengeId) {
      set({
        gameState: { ...st, challengeStatus: 'cancelled' },
        chatReadOnlyReason: 'Le chat est en lecture seule: ce dÃ©fi a Ã©tÃ© annulÃ©.',
      });
    }
  },

  loadChallenges: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    await ChallengeService.expireChallenges();
    const challenges = await ChallengeService.getByPlayer(currentUser.id);
    const mapped = challenges.map(dbChallengeToStore);
    set({ challenges: mapped.filter(c => c.status === 'open' || c.status === 'accepted') });
  },

  loadOpenChallenges: async () => {
    const { currentUser } = get();
    if (!currentUser) return;
    await ChallengeService.expireChallenges();
    const openChallenges = await ChallengeService.getOpenChallenges(currentUser.id);
    set({ openChallenges: openChallenges.map(dbChallengeToStore) });
  },

  // â”€â”€ Online Players â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  loadOnlinePlayers: async () => {
    const players = await PlayerService.getOnlinePlayers();
    const mapped: OnlinePlayer[] = players.map((p, i) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      wins: p.totalWins,
      isOnline: p.isOnline,
      avatar: p.avatar,
      rank: i + 1,
      earnings: p.totalEarnings,
    }));
    set({ onlinePlayers: mapped });
  },

  loadLeaderboard: async () => {
    const players = await PlayerService.getLeaderboard();
    const mapped: OnlinePlayer[] = players.map((p, i) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      wins: p.totalWins,
      isOnline: p.isOnline,
      avatar: p.avatar,
      rank: i + 1,
      earnings: p.totalEarnings,
    }));
    set({ leaderboard: mapped });
  },

  // â”€â”€ Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  loadAdminSettings: async () => {
    const settings = await AdminService.getSettings();
    set({
      adminSettings: {
        aiMatchTime: settings.aiMatchTime,
        challengeMatchTime: settings.challengeMatchTime,
        platformFee: settings.platformFee,
        maxBet: settings.maxBet,
        minBet: settings.minBet,
        cdfRate: settings.cdfRate,
        usdRate: settings.usdRate,
        defaultCurrency: settings.defaultCurrency,
      },
    });
  },

  updateAdminSettings: async (settings) => {
    set(s => ({ adminSettings: { ...s.adminSettings, ...settings } }));
    await AdminService.updateSettings({
      aiMatchTime: settings.aiMatchTime,
      challengeMatchTime: settings.challengeMatchTime,
      platformFee: settings.platformFee,
      maxBet: settings.maxBet,
      minBet: settings.minBet,
      cdfRate: settings.cdfRate,
      usdRate: settings.usdRate,
      defaultCurrency: settings.defaultCurrency,
    });
  },

  // â”€â”€ Misc â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Abandon Game â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  abandonGame: () => {
    const { gameState, currentUser, adminSettings } = get();
    if (!gameState || gameState.gameOver) return;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // GARDE ANTI-DOUBLE-DÃ‰DUCTION
    // Si les finances sont dÃ©jÃ  rÃ©glÃ©es â†’ abandon sans impact financier
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (gameState.financialsSettled) {
      console.warn('[Finance] âš ï¸ Abandon aprÃ¨s rÃ¨glement dÃ©jÃ  effectuÃ© â€” pas de nouvelle dÃ©duction');
      const opponentColor: PieceColor = gameState.playerColor === 'red' ? 'black' : 'red';
      set({
        gameState: { ...gameState, gameOver: true, winner: opponentColor, selectedPiece: null, validMoves: [] },
        chatReadOnlyReason: 'Le chat est en lecture seule: la partie est terminÃ©e.',
      });
      return;
    }

    if (gameState.mode === 'ai') {
      // â”€â”€ IA : abandon gratuit, aucune pÃ©nalitÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      MatchService.deleteFinished(gameState.matchId);
      ChatService.deleteByMatch(gameState.matchId);
      get().addNotification({
        type: 'system',
        title: 'Partie abandonnÃ©e',
        message: 'Vous avez abandonnÃ© contre l\'IA â€” Aucune pÃ©nalitÃ©.',
      });

    } else if (gameState.betAmount > 0 && gameState.betDeducted && currentUser) {
      // â”€â”€ Mise payante ET mise dÃ©jÃ  dÃ©duite dans initGame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // La mise a Ã©tÃ© retirÃ©e une seule fois dans initGame (betDeducted = true)
      // Ici on SEULEMENT enregistre la transaction de perte et la commission
      // PAS de nouvelle soustraction du solde (Ã©vite la double dÃ©duction)
      const feeRate = adminSettings.platformFee / 100;
      const totalFees = gameState.betAmount * feeRate * 2;
      const prize = gameState.betAmount * 2 - totalFees;
      const isVirtual = gameState.useVirtualBet;

      if (isVirtual) {
        // Wallet virtuel : mise perdue â†’ juste mÃ j les stats
        const updatedUser = { ...currentUser, totalLosses: currentUser.totalLosses + 1 };
        set({ currentUser: updatedUser });
        PlayerService.update(currentUser.id, { totalLosses: updatedUser.totalLosses });
        get().addNotification({
          type: 'loss',
          title: 'ðŸš© Partie abandonnÃ©e (Virtuel)',
          message: `Mise virtuelle de ${gameState.betAmount.toLocaleString()} ${gameState.currency} perdue â€” L'adversaire remporte ${prize.toLocaleString()}.`,
          amount: gameState.betAmount,
        });
        // Pas de commission admin sur wallet virtuel

      } else {
        // Wallet rÃ©el : mise dÃ©jÃ  dÃ©duite dans initGame
        // On enregistre JUSTE la transaction d'abandon dans l'historique
        TransactionService.create({
          playerId: currentUser.id,
          type: 'loss',
          amount: gameState.betAmount,
          currency: gameState.currency,
          description: `Abandon match â€” mise perdue: ${gameState.betAmount.toLocaleString()} ${gameState.currency}`,
          status: 'completed',
          method: null,
        });
        // Mise Ã  jour stats uniquement (balance pas touchÃ©e â€” dÃ©jÃ  dÃ©duite)
        const updatedUser = { ...currentUser, totalLosses: currentUser.totalLosses + 1 };
        set({ currentUser: updatedUser });
        PlayerService.update(currentUser.id, { totalLosses: updatedUser.totalLosses });

        get().addNotification({
          type: 'loss',
          title: 'ðŸš© Partie abandonnÃ©e',
          message: `Mise de ${gameState.betAmount.toLocaleString()} ${gameState.currency} perdue. L'adversaire remporte ${prize.toLocaleString()} ${gameState.currency}.`,
          amount: gameState.betAmount,
        });
        // âœ… Commission admin sur abandon (match rÃ©el)
        if (totalFees > 0) {
          AdminWalletService.collectFee(totalFees, gameState.currency, gameState.matchId);
        }
      }

      // Suppression historique match aprÃ¨s abandon
      MatchService.deleteFinished(gameState.matchId);
      ChatService.deleteByMatch(gameState.matchId);

    } else {
      // Match sans mise (betAmount = 0 ou betDeducted = false) â€” abandon neutre
      get().addNotification({
        type: 'system',
        title: 'ðŸš© Partie abandonnÃ©e',
        message: 'Vous avez abandonnÃ© cette partie.',
      });
      MatchService.deleteFinished(gameState.matchId);
      ChatService.deleteByMatch(gameState.matchId);
    }

    // Marquer la partie comme terminÃ©e (dÃ©faite pour l'abandonnant)
    const opponentColor: PieceColor = gameState.playerColor === 'red' ? 'black' : 'red';
    set({
      gameState: {
        ...gameState,
        gameOver: true,
        winner: opponentColor,
        selectedPiece: null,
        validMoves: [],
        financialsSettled: true, // âœ… EmpÃªche tout nouveau rÃ¨glement financier
      },
      chatReadOnlyReason: 'Le chat est en lecture seule: la partie est terminÃ©e.',
    });
  },

  setAIDifficulty: (diff) => set({ aiDifficulty: diff }),

  convertAmount: (amount, from, to) => {
    const { adminSettings } = get();
    if (from === to) return amount;
    if (from === 'USD' && to === 'CDF') return amount * adminSettings.cdfRate;
    if (from === 'CDF' && to === 'USD') return amount / adminSettings.cdfRate;
    return amount;
  },

  decrementTimer: () => {
    const { gameState } = get();
    if (!gameState || gameState.gameOver) return;
    const isPlayerTurn = gameState.currentTurn === gameState.playerColor;
    if (isPlayerTurn) {
      const newTime = gameState.playerTimeLeft - 1;
      if (newTime <= 0) {
        set({ gameState: { ...gameState, playerTimeLeft: gameState.timePerTurn, currentTurn: gameState.playerColor === 'red' ? 'black' : 'red' } });
        if (gameState.mode === 'ai') setTimeout(() => get().aiMove(), 500);
      } else set({ gameState: { ...gameState, playerTimeLeft: newTime } });
    } else {
      const newTime = gameState.opponentTimeLeft - 1;
      if (newTime <= 0) set({ gameState: { ...gameState, opponentTimeLeft: gameState.timePerTurn, currentTurn: gameState.currentTurn === 'red' ? 'black' : 'red' } });
      else set({ gameState: { ...gameState, opponentTimeLeft: newTime } });
    }
  },
}));

export { getValidMoves, initPieces, getAIMove, checkGameOver };


