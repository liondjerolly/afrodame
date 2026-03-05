import type { Move, Piece, PieceColor } from '../store/gameStore';

export type AIDifficulty = 'facile' | 'moyen' | 'difficile';

export interface AIStrategyContext {
  pieces: Piece[];
  aiColor: PieceColor;
  boardSize: number;
  consecutiveDraws: number;
  getValidMoves: (piece: Piece, allPieces: Piece[], boardSize: number) => Move[];
  checkGameOver: (
    pieces: Piece[],
    currentTurn: PieceColor,
    boardSize: number,
    consecutiveDraws: number,
  ) => { over: boolean; winner: PieceColor | 'draw' | null };
}

interface AIStrategy {
  id: AIDifficulty;
  label: string;
  chooseMove: (ctx: AIStrategyContext) => Move | null;
}

export const AI_DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
};

function listMovesForColor(
  pieces: Piece[],
  color: PieceColor,
  boardSize: number,
  getValidMoves: AIStrategyContext['getValidMoves'],
): Move[] {
  const all: Move[] = [];
  for (const piece of pieces) {
    if (piece.color !== color) continue;
    all.push(...getValidMoves(piece, pieces, boardSize));
  }
  const captures = all.filter((move) => (move.capturedPieces?.length ?? 0) > 0);
  return captures.length > 0 ? captures : all;
}

function randomFrom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function applyMove(pieces: Piece[], move: Move, boardSize: number): Piece[] {
  let nextPieces = pieces.map((piece) => ({ ...piece }));
  if (move.capturedPieces?.length) {
    nextPieces = nextPieces.filter(
      (piece) => !move.capturedPieces?.some((captured) => captured.row === piece.row && captured.col === piece.col),
    );
  }

  const movedPiece = nextPieces.find((piece) => piece.row === move.fromRow && piece.col === move.fromCol);
  if (!movedPiece) return pieces;

  movedPiece.row = move.toRow;
  movedPiece.col = move.toCol;

  if (movedPiece.color === 'red' && movedPiece.row === boardSize - 1) movedPiece.isKing = true;
  if (movedPiece.color === 'black' && movedPiece.row === 0) movedPiece.isKing = true;

  return nextPieces;
}

function evaluatePosition(pieces: Piece[], aiColor: PieceColor, boardSize: number): number {
  const enemyColor: PieceColor = aiColor === 'red' ? 'black' : 'red';
  let score = 0;

  for (const piece of pieces) {
    const mine = piece.color === aiColor;
    const sign = mine ? 1 : -1;
    let value = piece.isKing ? 36 : 12;

    if (!piece.isKing) {
      const progression = piece.color === 'red' ? piece.row : boardSize - 1 - piece.row;
      value += progression * 0.45;
    }

    const centerBonus = boardSize / 2 - Math.abs(piece.col - boardSize / 2);
    value += centerBonus * 0.2;

    score += sign * value;
  }

  const myPieces = pieces.filter((piece) => piece.color === aiColor).length;
  const enemyPieces = pieces.filter((piece) => piece.color === enemyColor).length;
  score += (myPieces - enemyPieces) * 7;

  return score;
}

function minimax(
  pieces: Piece[],
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiColor: PieceColor,
  boardSize: number,
  consecutiveDraws: number,
  getValidMoves: AIStrategyContext['getValidMoves'],
  checkGameOver: AIStrategyContext['checkGameOver'],
): number {
  const enemyColor: PieceColor = aiColor === 'red' ? 'black' : 'red';
  const currentColor: PieceColor = maximizing ? aiColor : enemyColor;

  const { over, winner } = checkGameOver(pieces, currentColor, boardSize, consecutiveDraws);
  if (over) {
    if (winner === aiColor) return 100_000 + depth;
    if (winner === enemyColor) return -100_000 - depth;
    return 0;
  }

  if (depth === 0) return evaluatePosition(pieces, aiColor, boardSize);

  const moves = listMovesForColor(pieces, currentColor, boardSize, getValidMoves);
  if (moves.length === 0) {
    return maximizing ? -90_000 : 90_000;
  }

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const score = minimax(
        applyMove(pieces, move, boardSize),
        depth - 1,
        alpha,
        beta,
        false,
        aiColor,
        boardSize,
        consecutiveDraws,
        getValidMoves,
        checkGameOver,
      );
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    const score = minimax(
      applyMove(pieces, move, boardSize),
      depth - 1,
      alpha,
      beta,
      true,
      aiColor,
      boardSize,
      consecutiveDraws,
      getValidMoves,
      checkGameOver,
    );
    best = Math.min(best, score);
    beta = Math.min(beta, score);
    if (beta <= alpha) break;
  }
  return best;
}

const facileStrategy: AIStrategy = {
  id: 'facile',
  label: AI_DIFFICULTY_LABELS.facile,
  chooseMove: (ctx) => {
    const legalMoves = listMovesForColor(ctx.pieces, ctx.aiColor, ctx.boardSize, ctx.getValidMoves);
    return randomFrom(legalMoves);
  },
};

const moyenStrategy: AIStrategy = {
  id: 'moyen',
  label: AI_DIFFICULTY_LABELS.moyen,
  chooseMove: (ctx) => {
    const legalMoves = listMovesForColor(ctx.pieces, ctx.aiColor, ctx.boardSize, ctx.getValidMoves);
    if (legalMoves.length === 0) return null;

    const captures = legalMoves.filter((move) => (move.capturedPieces?.length ?? 0) > 0);
    if (captures.length > 0) {
      const maxCapture = Math.max(...captures.map((move) => move.capturedPieces?.length ?? 0));
      const bestCaptures = captures.filter((move) => (move.capturedPieces?.length ?? 0) === maxCapture);
      return randomFrom(bestCaptures);
    }

    const promotionRow = ctx.aiColor === 'red' ? ctx.boardSize - 1 : 0;
    const promotions = legalMoves.filter((move) => move.toRow === promotionRow);
    if (promotions.length > 0) return randomFrom(promotions);

    const sorted = [...legalMoves].sort((a, b) => {
      const center = ctx.boardSize / 2;
      const aCenter = Math.abs(a.toCol - center);
      const bCenter = Math.abs(b.toCol - center);
      return aCenter - bCenter;
    });
    return sorted[0] ?? null;
  },
};

const difficileStrategy: AIStrategy = {
  id: 'difficile',
  label: AI_DIFFICULTY_LABELS.difficile,
  chooseMove: (ctx) => {
    const legalMoves = listMovesForColor(ctx.pieces, ctx.aiColor, ctx.boardSize, ctx.getValidMoves);
    if (legalMoves.length === 0) return null;

    const depth = 4;
    let bestMove: Move | null = null;
    let bestScore = -Infinity;

    for (const move of legalMoves) {
      const nextPieces = applyMove(ctx.pieces, move, ctx.boardSize);
      const score = minimax(
        nextPieces,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        ctx.aiColor,
        ctx.boardSize,
        ctx.consecutiveDraws,
        ctx.getValidMoves,
        ctx.checkGameOver,
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove ?? legalMoves[0] ?? null;
  },
};

const STRATEGIES: Record<AIDifficulty, AIStrategy> = {
  facile: facileStrategy,
  moyen: moyenStrategy,
  difficile: difficileStrategy,
};

export function chooseAIMove(difficulty: AIDifficulty, context: AIStrategyContext): Move | null {
  return STRATEGIES[difficulty].chooseMove(context);
}

