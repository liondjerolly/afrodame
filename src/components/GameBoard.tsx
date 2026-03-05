import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import {
  Crown, Clock, MessageCircle, ArrowLeft, Flag,
  AlertTriangle, Trophy, Handshake, Frown, ArrowUp, ArrowDown,
  ShieldX, Info, Lock,
} from 'lucide-react';
import ChatPanel from './ChatPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lightenColor(hex: string): string {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(r + 80, 255)}, ${Math.min(g + 80, 255)}, ${Math.min(b + 80, 255)})`;
  } catch { return hex; }
}

function isBackwardCell(pieceRow: number, pieceColor: string, targetRow: number): boolean {
  if (pieceColor === 'red') return targetRow < pieceRow;
  return targetRow > pieceRow;
}

export default function GameBoard() {
  const {
    gameState, selectPiece, makeMove, toggleChat, chatOpen, unreadMessages,
    setCurrentView, initGame, abandonGame,
  } = useGameStore();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [movingPieceId, setMovingPieceId] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<{ row: number; col: number } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [blockedCell, setBlockedCell] = useState<{ row: number; col: number } | null>(null);
  const [showBackwardRule, setShowBackwardRule] = useState(false);
  const [justPromoted, setJustPromoted] = useState<string | null>(null);
  const [lockedPieceFlash, setLockedPieceFlash] = useState<string | null>(null);

  useEffect(() => {
    if (gameState?.gameOver) {
      setTimeout(() => setShowResult(true), 600);
    } else {
      setShowResult(false);
    }
  }, [gameState?.gameOver]);

  useEffect(() => {
    if (!gameState || gameState.gameOver) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      useGameStore.getState().decrementTimer();
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.currentTurn, gameState?.gameOver]);

  // Détecte promotion en dame
  const kingsCount = gameState?.pieces.filter(p => p.isKing).length ?? 0;
  useEffect(() => {
    if (!gameState || kingsCount === 0) return;
    const kings = gameState.pieces.filter(p => p.isKing);
    if (kings.length > 0) {
      const lastKing = kings[kings.length - 1];
      setJustPromoted(lastKing.id);
      setTimeout(() => setJustPromoted(null), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kingsCount]);

  if (!gameState) return null;

  const {
    pieces, selectedPiece, validMoves, currentTurn, gameOver, winner,
    boardSize, playerColor, is3D, playerPieceColor, opponentPieceColor,
    playerTimeLeft, opponentTimeLeft,
    opponentName, betAmount, mode, currency, aiDifficulty,
  } = gameState;

  const isOnlineMode = mode === 'online' || mode === 'challenge';
  const isMyTurn     = currentTurn === playerColor;
  const opponentColor = playerColor === 'red' ? 'black' : 'red';

  // ─── Cell Click Handler ───────────────────────────────────────────────────
  const handleCellClick = useCallback((row: number, col: number) => {
    if (gameOver) return;

    const piece    = pieces.find(p => p.row === row && p.col === col);
    const validMove = validMoves.find(m => m.toRow === row && m.toCol === col);

    // ── BLOCAGE ADVERSAIRE ─────────────────────────────────────────────────
    // En mode IA et en ligne : SEULS les pions de playerColor sont cliquables
    if (piece && piece.color !== playerColor) {
      // Pion adverse cliqué → animation de refus + message
      setLockedPieceFlash(`${row}-${col}`);
      setTimeout(() => setLockedPieceFlash(null), 900);
      return;
    }

    // ── Tour bloqué (pas mon tour en ligne) ───────────────────────────────
    if (isOnlineMode && !isMyTurn && !validMove) {
      return; // Attendre le tour
    }

    if (validMove && selectedPiece) {
      // ✅ Mouvement valide
      setMovingPieceId(selectedPiece.id);
      if (validMove.capturedPieces && validMove.capturedPieces.length > 0) {
        setLastCapture(validMove.capturedPieces[validMove.capturedPieces.length - 1]);
        setTimeout(() => setLastCapture(null), 1200);
      }
      makeMove(validMove);
      setTimeout(() => setMovingPieceId(null), 400);
    } else if (!piece && selectedPiece && !validMove) {
      const isBackward = !selectedPiece.isKing &&
        isBackwardCell(selectedPiece.row, selectedPiece.color, row);
      const isDark = (row + col) % 2 === 1;
      if (isDark && isBackward) {
        setBlockedCell({ row, col });
        setShowBackwardRule(true);
        setTimeout(() => { setBlockedCell(null); setShowBackwardRule(false); }, 1500);
      } else {
        useGameStore.setState(s => ({
          gameState: s.gameState
            ? { ...s.gameState, selectedPiece: null, validMoves: [] }
            : null,
        }));
      }
    } else if (piece && piece.color === currentTurn && piece.color === playerColor) {
      selectPiece(piece);
    } else {
      useGameStore.setState(s => ({
        gameState: s.gameState
          ? { ...s.gameState, selectedPiece: null, validMoves: [] }
          : null,
      }));
    }
  }, [
    gameOver, pieces, validMoves, selectedPiece, currentTurn,
    playerColor, isOnlineMode, isMyTurn, makeMove, selectPiece,
  ]);

  const handleAbandon = () => { setShowAbandonConfirm(false); abandonGame(); };

  // ─── Move Helpers ─────────────────────────────────────────────────────────
  const isValidMoveTarget = (r: number, c: number) =>
    validMoves.some(m => m.toRow === r && m.toCol === c);
  const isCaptureMove = (r: number, c: number) =>
    validMoves.some(m => m.toRow === r && m.toCol === c && m.capturedPieces?.length);
  const isBackwardCapture = (r: number, c: number) => {
    if (!selectedPiece || selectedPiece.isKing) return false;
    return validMoves.some(m =>
      m.toRow === r && m.toCol === c &&
      m.capturedPieces?.length &&
      isBackwardCell(selectedPiece.row, selectedPiece.color, r)
    );
  };
  const isKingPath = (r: number, c: number) => {
    if (!selectedPiece?.isKing) return false;
    return validMoves.some(m => {
      if (m.toRow === r && m.toCol === c) return false;
      const dr = Math.sign(m.toRow - selectedPiece.row);
      const dc = Math.sign(m.toCol - selectedPiece.col);
      let rr = selectedPiece.row + dr, rc = selectedPiece.col + dc;
      while (rr !== m.toRow || rc !== m.toCol) {
        if (rr === r && rc === c) return true;
        rr += dr; rc += dc;
      }
      return false;
    });
  };

  // ─── Tailles ─────────────────────────────────────────────────────────────
  const cellSize  = boardSize === 10 ? 'w-9 h-9 sm:w-11 sm:h-11' : 'w-11 h-11 sm:w-13 sm:h-13';
  const pieceSize = boardSize === 10 ? 'w-7 h-7 sm:w-9 sm:h-9'  : 'w-9 h-9 sm:w-11 sm:h-11';

  const playerIsRed = playerColor === 'red';
  const playerTime  = playerIsRed ? playerTimeLeft  : opponentTimeLeft;
  const oppTime     = playerIsRed ? opponentTimeLeft : playerTimeLeft;
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const playerPieces   = pieces.filter(p => p.color === playerColor);
  const opponentPieces = pieces.filter(p => p.color === opponentColor);
  const currentUser    = useGameStore.getState().currentUser;

  const diffLabel: Record<string, string> = {
    facile: 'Facile',
    moyen: 'Moyen',
    difficile: 'Difficile',
  };
  const modeLabel = mode === 'ai' ? 'vs IA' : mode === 'online' ? 'En ligne' : 'Défi';
  const modeColor = mode === 'ai'
    ? 'text-purple-400' : mode === 'online' ? 'text-green-400' : 'text-yellow-400';

  const hasAnyCapture     = validMoves.some(m => m.capturedPieces?.length);
  const hasBackwardCapture = selectedPiece && !selectedPiece.isKing && validMoves.some(m =>
    m.capturedPieces?.length && isBackwardCell(selectedPiece.row, selectedPiece.color, m.toRow)
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-black/40 backdrop-blur border-b border-white/5">
        <button
          onClick={() => setCurrentView('home')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={17} />
          <span className="hidden sm:inline">Accueil</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className={`text-xs uppercase tracking-wider font-orbitron font-bold ${modeColor}`}>
            {modeLabel}
          </span>
          {mode === 'ai' && (
            <span className="text-xs text-white/40">{diffLabel[aiDifficulty]}</span>
          )}
          {betAmount > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded-full border border-yellow-500/30 font-bold">
              💰 {betAmount.toLocaleString()} {currency}
            </span>
          )}
          {/* Indicateur couleur du joueur */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-full border border-white/10">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: playerPieceColor }}
            />
            <span className="text-white/50 text-xs">Vos pions</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleChat}
            className="relative p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <MessageCircle size={17} className="text-white/60" />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold animate-bounce">
                {unreadMessages}
              </span>
            )}
          </button>
          {!gameOver && (
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setShowAbandonConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/25 transition-all text-sm font-semibold"
            >
              <Flag size={15} />
              <span className="hidden sm:inline">Abandonner</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Bannière : Tour en ligne ────────────────────────────────── */}
      {isOnlineMode && !gameOver && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTurn}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`mx-4 mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold ${
              isMyTurn
                ? 'bg-green-500/10 border-green-500/30 text-green-300'
                : 'bg-orange-500/10 border-orange-500/20 text-orange-300'
            }`}
          >
            {isMyTurn ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                🎯 <strong>Votre tour</strong> — Choisissez un pion et jouez!
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                ⏳ Tour de <strong>{opponentName}</strong> — Attendez son coup...
                <Lock size={13} className="ml-auto text-orange-400/60" />
                <span className="text-orange-400/60 text-xs">Pions verrouillés</span>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Retour arrière interdit ─────────────────────────────────── */}
      <AnimatePresence>
        {showBackwardRule && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 mt-2 flex items-center gap-2 bg-red-900/40 border border-red-500/40 rounded-xl px-4 py-2 text-sm"
          >
            <ShieldX size={16} className="text-red-400 flex-shrink-0" />
            <span className="text-red-300 font-semibold">Retour arrière interdit!</span>
            <span className="text-red-300/60 text-xs ml-1">
              — Un pion ne recule que pour <strong className="text-orange-400">manger un adversaire</strong>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Capture arrière disponible ──────────────────────────────── */}
      <AnimatePresence>
        {hasBackwardCapture && !showBackwardRule && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-4 mt-2 flex items-center gap-2 bg-orange-900/30 border border-orange-500/30 rounded-xl px-3 py-1.5 text-xs"
          >
            <ArrowDown size={12} className="text-orange-400" />
            <span className="text-orange-300">Capture arrière disponible — vous pouvez manger en reculant!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Capture obligatoire ─────────────────────────────────────── */}
      <AnimatePresence>
        {hasAnyCapture && isMyTurn && !gameOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mx-4 mt-1 flex items-center gap-2 bg-yellow-900/20 border border-yellow-500/20 rounded-xl px-3 py-1 text-xs"
          >
            <AlertTriangle size={11} className="text-yellow-400" />
            <span className="text-yellow-300/80">Capture obligatoire — vous devez manger!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-between p-2 sm:p-3 gap-2">

        {/* Adversaire */}
        <div className="w-full max-w-2xl">
          <div className={`flex items-center justify-between glass rounded-2xl px-4 py-3 transition-all duration-300 ${
            currentTurn === opponentColor && !gameOver
              ? 'border border-yellow-500/40 shadow-lg shadow-yellow-500/10'
              : 'border border-white/5'
          }`}>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-xl border-2 border-white/10">
                {mode === 'ai' ? '🤖' : '👤'}
                {currentTurn === opponentColor && !gameOver && (
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{opponentName}</p>
                <div className="flex items-center gap-2">
                  <p className="text-white/40 text-xs">{opponentPieces.length} pions</p>
                  {/* Indicateur couleur adversaire */}
                  <div
                    className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
                    style={{ background: opponentPieceColor }}
                    title="Couleur des pions adverses"
                  />
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold font-orbitron ${
              oppTime <= 10 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-white/5 text-white/80'
            }`}>
              <Clock size={14} />
              {fmt(oppTime)}
            </div>
          </div>
        </div>

        {/* ── Plateau ─────────────────────────────────────────────────── */}
        <div className={`${is3D ? 'board-3d-container' : ''} relative`}>
          <div className={`${is3D ? 'board-3d' : ''} inline-block`}>
            <div
              className="rounded-2xl overflow-hidden shadow-2xl border-2 border-yellow-900/40"
              style={{ display: 'grid', gridTemplateColumns: `repeat(${boardSize}, 1fr)` }}
            >
              {Array.from({ length: boardSize }, (_, row) =>
                Array.from({ length: boardSize }, (_, col) => {
                  const isDark  = (row + col) % 2 === 1;
                  const piece   = pieces.find(p => p.row === row && p.col === col);
                  const isSelected    = selectedPiece?.row === row && selectedPiece?.col === col;
                  const isValid       = isValidMoveTarget(row, col);
                  const isCapture     = isCaptureMove(row, col);
                  const isBwCapture   = isBackwardCapture(row, col);
                  const isLastCapCell = lastCapture?.row === row && lastCapture?.col === col;
                  const isPath        = isKingPath(row, col);
                  const isBlocked     = blockedCell?.row === row && blockedCell?.col === col;
                  const isLocked      = lockedPieceFlash === `${row}-${col}`;
                  // Pion adverse = verrouillé visuellement
                  const isOpponentPiece = piece && piece.color !== playerColor;

                  return (
                    <div
                      key={`${row}-${col}`}
                      onClick={() => isDark ? handleCellClick(row, col) : undefined}
                      className={`
                        ${cellSize} relative flex items-center justify-center select-none
                        ${isDark ? 'board-cell-black' : 'board-cell-red'}
                        ${isDark && (!isOpponentPiece || isOnlineMode) ? 'cursor-pointer' : ''}
                        ${isSelected ? 'ring-2 ring-yellow-400 ring-inset z-10' : ''}
                        ${isLastCapCell ? '!bg-orange-500/50' : ''}
                        ${isPath && !isValid ? 'bg-blue-500/10' : ''}
                        ${isBlocked ? 'animate-shake !bg-red-500/30' : ''}
                        ${isLocked ? 'animate-shake !bg-red-800/40' : ''}
                        transition-colors duration-150
                      `}
                    >
                      {/* Indicateur mouvement valide */}
                      {isDark && isValid && !piece && (
                        <motion.div
                          initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className={`
                            w-3 h-3 sm:w-4 sm:h-4 rounded-full valid-move
                            ${isBwCapture
                              ? 'bg-orange-400/90 ring-2 ring-orange-400 ring-offset-1 ring-offset-transparent'
                              : isCapture
                                ? 'bg-red-400/90 ring-2 ring-red-400'
                                : 'bg-yellow-400/70'
                            }
                          `}
                        />
                      )}

                      {/* Couloir roi */}
                      {isDark && isPath && !isValid && !piece && (
                        <div className="w-2 h-2 rounded-full bg-blue-400/25" />
                      )}

                      {/* Case bloquée */}
                      {isDark && isBlocked && (
                        <motion.div
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute inset-0 flex items-center justify-center z-20"
                        >
                          <ShieldX size={18} className="text-red-500 drop-shadow-lg" />
                        </motion.div>
                      )}

                      {/* Cadenas sur pion adverse verrouillé */}
                      {isLocked && isOpponentPiece && (
                        <motion.div
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1.4, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="absolute -top-1 -right-1 z-30"
                        >
                          <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                            <Lock size={9} className="text-white" />
                          </div>
                        </motion.div>
                      )}

                      {/* Pion */}
                      {piece && (
                        <motion.div
                          key={piece.id}
                          layout
                          initial={false}
                          animate={{
                            scale: isSelected ? 1.2 : 1,
                            y: isSelected ? -3 : 0,
                          }}
                          className={`
                            ${pieceSize} rounded-full relative flex items-center justify-center
                            ${piece.color === playerColor ? 'cursor-pointer' : 'cursor-not-allowed'}
                            ${piece.id === movingPieceId ? 'piece-moving' : ''}
                            ${is3D ? 'piece-3d' : ''}
                            shadow-lg z-10
                          `}
                          style={{
                            background: piece.color === playerColor
                              ? `radial-gradient(circle at 35% 35%, ${lightenColor(playerPieceColor)}, ${playerPieceColor})`
                              : `radial-gradient(circle at 35% 35%, ${lightenColor(opponentPieceColor)}, ${opponentPieceColor})`,
                            boxShadow: isSelected
                              ? `0 0 0 3px #fbbf24, 0 8px 20px rgba(0,0,0,0.7), inset 0 2px 4px rgba(255,255,255,0.3)`
                              : piece.color !== playerColor
                                ? `0 4px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.08)`
                                : `0 4px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.2)`,
                            // Pions adverses légèrement atténués pour distinction visuelle
                            opacity: piece.color !== playerColor ? 0.82 : 1,
                            filter: isOnlineMode && piece.color !== playerColor && !isMyTurn
                              ? 'brightness(0.75)'
                              : 'none',
                          }}
                        >
                          {/* Couronne dame */}
                          {piece.isKing && (
                            <motion.div
                              initial={piece.id === justPromoted ? { scale: 0, rotate: -180 } : false}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: 'spring', bounce: 0.6 }}
                            >
                              <Crown size={10} className="text-yellow-300 drop-shadow-lg" fill="currentColor" />
                            </motion.div>
                          )}
                          {is3D && <div className="piece-shadow absolute" />}

                          {/* Flash promotion */}
                          {piece.id === justPromoted && (
                            <motion.div
                              initial={{ scale: 1, opacity: 1 }}
                              animate={{ scale: 3, opacity: 0 }}
                              transition={{ duration: 0.8 }}
                              className="absolute inset-0 rounded-full bg-yellow-400/50 pointer-events-none"
                            />
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Légende ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-white/40 px-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-400/70" />
            <span>Avancer</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-400/90 ring-1 ring-red-400" />
            <span>Capture avant</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-400/90 ring-1 ring-orange-400" />
            <span>Capture arrière ✅</span>
          </div>
          {pieces.some(p => p.isKing) && (
            <div className="flex items-center gap-1">
              <Crown size={10} className="text-yellow-400" fill="currentColor" />
              <span>Dame = couloir illimité</span>
            </div>
          )}
          {isOnlineMode && (
            <div className="flex items-center gap-1">
              <Lock size={10} className="text-red-400" />
              <span>Pions adverses = verrouillés</span>
            </div>
          )}
        </div>

        {/* Info règle retour */}
        <div
          className="flex items-center gap-1.5 text-xs text-white/25 cursor-help hover:text-white/50 transition-colors"
          title="Un pion peut reculer UNIQUEMENT pour manger un adversaire."
        >
          <Info size={11} />
          <span>Recul = capture obligatoire</span>
          <ArrowUp size={10} className="text-green-400/50" />
          <span className="text-green-400/50">manger</span>
          <span className="mx-1">•</span>
          <ArrowDown size={10} className="text-red-400/50" />
          <span className="text-red-400/50">déplacement = bloqué</span>
        </div>

        {/* Joueur actuel */}
        <div className="w-full max-w-2xl">
          <div className={`flex items-center justify-between glass rounded-2xl px-4 py-3 transition-all duration-300 ${
            isMyTurn && !gameOver
              ? 'border border-yellow-500/40 shadow-lg shadow-yellow-500/10'
              : 'border border-white/5'
          }`}>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-yellow-600 to-orange-700 flex items-center justify-center text-xl border-2 border-yellow-500/30">
                {currentUser?.avatar || '👤'}
                {isMyTurn && !gameOver && (
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">
                  {currentUser ? `${currentUser.firstName} ${currentUser.name}` : 'Vous'}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-white/40 text-xs">{playerPieces.length} pions</p>
                  <div
                    className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
                    style={{ background: playerPieceColor }}
                    title="Vos pions"
                  />
                  {isOnlineMode && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isMyTurn
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-white/5 text-white/30'
                    }`}>
                      {isMyTurn ? '▶ À vous' : '⏸ Pause'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold font-orbitron ${
              playerTime <= 10 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-white/5 text-white/80'
            }`}>
              <Clock size={14} />
              {fmt(playerTime)}
            </div>
          </div>
        </div>

        {/* Indicateur mode IA simple */}
        {!gameOver && mode === 'ai' && (
          <div className="flex items-center gap-2 text-sm pb-1">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isMyTurn ? 'bg-yellow-400' : 'bg-purple-400'}`} />
            <span className="text-white/60">
              {isMyTurn ? '🎯 Votre tour — jouez!' : '🤖 L\'IA réfléchit...'}
            </span>
          </div>
        )}
      </div>

      {/* Chat */}
      {chatOpen && <ChatPanel />}

      {/* ── Modal Abandon ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAbandonConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.7, opacity: 0, y: 30 }}
              transition={{ type: 'spring', bounce: 0.35 }}
              className="bg-[#0f1117] border border-red-500/30 rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl shadow-red-500/10"
            >
              <div className="w-16 h-16 bg-red-500/15 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-500/30">
                <Flag size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white font-orbitron mb-2">Abandonner la partie?</h2>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-5 text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {mode === 'ai' ? (
                      <p className="text-orange-300 text-sm">
                        La partie contre l'IA sera annulée.<br />
                        <span className="text-white/50 text-xs">Aucune pénalité — partie gratuite.</span>
                      </p>
                    ) : betAmount > 0 ? (
                      <p className="text-orange-300 text-sm">
                        En abandonnant, vous <strong className="text-red-400">perdez votre mise</strong> de{' '}
                        <strong className="text-yellow-400">{betAmount.toLocaleString()} {currency}</strong>.<br />
                        <span className="text-white/50 text-xs">L'adversaire remporte le gain (-2% frais).</span>
                      </p>
                    ) : (
                      <p className="text-orange-300 text-sm">
                        Vous déclarez forfait.<br />
                        <span className="text-white/50 text-xs">L'adversaire est déclaré vainqueur.</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAbandonConfirm(false)}
                  className="flex-1 py-3 bg-white/8 border border-white/10 text-white rounded-xl font-semibold hover:bg-white/15 transition-all text-sm"
                >
                  Continuer
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleAbandon}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-500/20"
                >
                  <Flag size={15} /> Abandonner
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Résultat ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.4 }}
              className="glass-dark rounded-3xl p-8 text-center max-w-sm w-full border border-yellow-500/30 shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', bounce: 0.5 }}
                className="mb-4 flex justify-center"
              >
                {winner === playerColor
                  ? <Trophy size={64} className="text-yellow-400 drop-shadow-lg" />
                  : winner === 'draw'
                    ? <Handshake size={64} className="text-blue-400" />
                    : <Frown size={64} className="text-red-400" />
                }
              </motion.div>

              <h2 className={`text-2xl font-bold font-orbitron mb-2 ${
                winner === playerColor ? 'gradient-gold' : winner === 'draw' ? 'text-blue-400' : 'text-red-400'
              }`}>
                {winner === playerColor ? 'Victoire! 🏆' : winner === 'draw' ? 'Match Nul! 🤝' : 'Défaite! 😔'}
              </h2>

              {betAmount > 0 && winner === playerColor && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl px-4 py-2 mb-4"
                >
                  <p className="text-yellow-400 font-bold text-lg">
                    +{(betAmount * 1.96).toLocaleString()} {currency}
                  </p>
                  <p className="text-yellow-400/60 text-xs">(-2% frais plateforme)</p>
                </motion.div>
              )}
              {betAmount > 0 && winner !== playerColor && winner !== 'draw' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-2 mb-4"
                >
                  <p className="text-red-400 font-bold">-{betAmount.toLocaleString()} {currency}</p>
                  <p className="text-red-400/60 text-xs">Mise perdue</p>
                </motion.div>
              )}

              <p className="text-white/60 text-sm mb-4">
                {winner === 'draw' ? 'Égalité parfaite!'
                  : winner === playerColor
                    ? `Bravo! ${playerPieces.length} pions restants`
                    : `${opponentName} remporte la partie (${opponentPieces.length} pions)`
                }
              </p>

              {winner !== 'draw' && (
                <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-4 text-xs text-white/40 text-left">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Info size={11} className="text-blue-400" />
                    <span className="text-blue-300/70 font-semibold">Condition de victoire</span>
                  </div>
                  <p>
                    {winner === playerColor
                      ? "L'adversaire n'a plus de pions ou ne peut plus se déplacer."
                      : "Vous n'avez plus de pions ou vous êtes bloqué."}
                  </p>
                </div>
              )}

              {gameState.consecutiveDraws > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-4 text-xs text-blue-300">
                  {gameState.consecutiveDraws} nul(s) —{' '}
                  {gameState.consecutiveDraws >= 3
                    ? 'Règle du 4ème match appliquée'
                    : `${3 - gameState.consecutiveDraws} nul(s) avant départage`}
                </div>
              )}

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setShowResult(false); setCurrentView('home'); }}
                  className="flex-1 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-colors text-sm"
                >
                  🏠 Accueil
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setShowResult(false);
                    initGame(mode, {
                      betAmount, is3D, playerPieceColor, opponentPieceColor, currency,
                      playerColor, aiDiff: aiDifficulty,
                    });
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black rounded-xl font-bold hover:from-yellow-400 hover:to-yellow-500 transition-all text-sm shadow-lg shadow-yellow-500/20"
                >
                  🔄 Rejouer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

