import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Eye,
  FastForward,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  Swords,
} from 'lucide-react';
import {
  useGameStore,
  initPieces,
  getAIMove,
  checkGameOver,
  type AIDifficulty,
  type Move,
  type Piece,
  type PieceColor,
} from '../store/gameStore';
import { MatchMoveService, MatchService, type MatchData, type MatchMoveData } from '../lib/database';
import { AI_DIFFICULTY_LABELS } from '../lib/aiStrategies';

type SimulationSpeed = 'normal' | 'rapide';

interface ArenaSimulation {
  match: MatchData;
  pieces: Piece[];
  currentTurn: PieceColor;
  moveNumber: number;
  consecutiveDraws: number;
  redDifficulty: AIDifficulty;
  blackDifficulty: AIDifficulty;
  startedAt: number;
  finishedAt: number | null;
  winner: PieceColor | 'draw' | null;
}

const SPEED_DELAY: Record<SimulationSpeed, number> = {
  normal: 900,
  rapide: 130,
};

const LEVELS: AIDifficulty[] = ['facile', 'moyen', 'difficile'];

function applyMoveToBoard(pieces: Piece[], move: Move, boardSize: number): Piece[] {
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

function parsePiecesFromState(boardState: string): Piece[] {
  if (!boardState) return [];
  try {
    const parsed = JSON.parse(boardState) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Piece[];
  } catch {
    return [];
  }
}

function estimateWinnerFromPieces(pieces: Piece[]): PieceColor | 'draw' | null {
  const red = pieces.filter((piece) => piece.color === 'red').length;
  const black = pieces.filter((piece) => piece.color === 'black').length;
  if (red === 0 && black === 0) return 'draw';
  if (red === 0) return 'black';
  if (black === 0) return 'red';
  if (red > black) return 'red';
  if (black > red) return 'black';
  return 'draw';
}

function formatDuration(startIso: string, endIso?: string | null): string {
  if (!endIso) return '-';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '-';
  const total = Math.floor((end - start) / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min} min ${sec.toString().padStart(2, '0')} s`;
}

function colorLabel(color: PieceColor | 'draw' | null): string {
  if (color === 'red') return 'Rouge';
  if (color === 'black') return 'Noir';
  if (color === 'draw') return 'Match nul';
  return 'En cours';
}

function ReadOnlyBoard({ pieces, boardSize }: { pieces: Piece[]; boardSize: number }) {
  const cells = Array.from({ length: boardSize * boardSize }, (_, index) => index);
  const cellSize = boardSize === 10 ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-8 h-8 sm:w-10 sm:h-10';
  const pieceSize = boardSize === 10 ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-6 h-6 sm:w-7 sm:h-7';

  return (
    <div
      className="mx-auto rounded-2xl overflow-hidden border border-white/10"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
    >
      {cells.map((index) => {
        const row = Math.floor(index / boardSize);
        const col = index % boardSize;
        const isDark = (row + col) % 2 === 1;
        const piece = pieces.find((item) => item.row === row && item.col === col) || null;

        return (
          <div
            key={`${row}-${col}`}
            className={`${cellSize} flex items-center justify-center ${isDark ? 'bg-[#3a1a1a]' : 'bg-[#8a3b3b]'}`}
          >
            {piece && (
              <div
                className={`${pieceSize} rounded-full border border-black/30 flex items-center justify-center text-[9px]`}
                style={{
                  background:
                    piece.color === 'red'
                      ? 'radial-gradient(circle at 35% 35%, #f87171, #dc2626)'
                      : 'radial-gradient(circle at 35% 35%, #9ca3af, #1f2937)',
                }}
              >
                {piece.isKing ? '♛' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ArenaIA() {
  const { currentUser, initGame, setCurrentView } = useGameStore();

  const [humanDifficulty, setHumanDifficulty] = useState<AIDifficulty>('moyen');
  const [redDifficulty, setRedDifficulty] = useState<AIDifficulty>('moyen');
  const [blackDifficulty, setBlackDifficulty] = useState<AIDifficulty>('difficile');
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>('normal');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [simulation, setSimulation] = useState<ArenaSimulation | null>(null);
  const [activeMatches, setActiveMatches] = useState<MatchData[]>([]);
  const [arenaFinishedMatches, setArenaFinishedMatches] = useState<MatchData[]>([]);
  const [analysisMatchId, setAnalysisMatchId] = useState('');
  const [analysisMoves, setAnalysisMoves] = useState<MatchMoveData[]>([]);
  const [spectatorMatch, setSpectatorMatch] = useState<MatchData | null>(null);
  const [spectatorPieces, setSpectatorPieces] = useState<Piece[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const simulationRef = useRef<ArenaSimulation | null>(null);
  const speedRef = useRef<SimulationSpeed>('normal');
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spectatorChannelRef = useRef<{ unsubscribe?: () => void } | null>(null);
  const spectatorPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopLoop = useCallback(() => {
    if (loopRef.current) {
      clearTimeout(loopRef.current);
      loopRef.current = null;
    }
    setRunning(false);
  }, []);

  const clearSpectatorListeners = useCallback(() => {
    if (spectatorChannelRef.current?.unsubscribe) {
      spectatorChannelRef.current.unsubscribe();
    }
    spectatorChannelRef.current = null;
    if (spectatorPollRef.current) {
      clearInterval(spectatorPollRef.current);
      spectatorPollRef.current = null;
    }
  }, []);

  const loadLists = useCallback(async () => {
    setRefreshing(true);
    const [active, finishedArena] = await Promise.all([
      MatchService.getAllActive(60),
      MatchService.getByMode('ai_arena', 'finished', 120),
    ]);
    setActiveMatches(active);
    setArenaFinishedMatches(finishedArena);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadLists();
    const interval = setInterval(() => {
      void loadLists();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadLists]);

  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  useEffect(() => {
    speedRef.current = simulationSpeed;
  }, [simulationSpeed]);

  useEffect(() => {
    return () => {
      stopLoop();
      clearSpectatorListeners();
    };
  }, [clearSpectatorListeners, stopLoop]);

  useEffect(() => {
    if (!analysisMatchId) {
      setAnalysisMoves([]);
      return;
    }
    void (async () => {
      const moves = await MatchMoveService.getByMatch(analysisMatchId);
      setAnalysisMoves(moves);
    })();
  }, [analysisMatchId]);

  useEffect(() => {
    if (!spectatorMatch) {
      setSpectatorPieces([]);
      clearSpectatorListeners();
      return;
    }

    const initialPieces = parsePiecesFromState(spectatorMatch.boardState);
    setSpectatorPieces(initialPieces);
    clearSpectatorListeners();

    void (async () => {
      const channel = await MatchService.realTimeSubscribe(spectatorMatch.id, (updated) => {
        setSpectatorMatch(updated);
        setSpectatorPieces(parsePiecesFromState(updated.boardState));
      });

      if (channel) {
        spectatorChannelRef.current = {
          unsubscribe: () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (channel as any).unsubscribe?.();
            } catch {
              // silencieux
            }
          },
        };
      } else {
        spectatorPollRef.current = setInterval(async () => {
          const latest = await MatchService.findById(spectatorMatch.id);
          if (!latest) return;
          setSpectatorMatch(latest);
          setSpectatorPieces(parsePiecesFromState(latest.boardState));
        }, 2000);
      }
    })();
  }, [clearSpectatorListeners, spectatorMatch?.id]);

  const runOneSimulationStep = useCallback(async () => {
    const current = simulationRef.current;
    if (!current || current.match.status !== 'active') {
      stopLoop();
      return;
    }

    const difficulty = current.currentTurn === 'red' ? current.redDifficulty : current.blackDifficulty;
    const move = getAIMove(
      current.pieces,
      current.currentTurn,
      current.match.boardSize,
      difficulty,
      current.consecutiveDraws,
    );

    if (!move) {
      const forcedWinner: PieceColor = current.currentTurn === 'red' ? 'black' : 'red';
      const finishedAt = new Date().toISOString();
      const updatedMatch: MatchData = {
        ...current.match,
        status: 'finished',
        finishedAt,
      };
      const finishedSimulation: ArenaSimulation = {
        ...current,
        match: updatedMatch,
        winner: forcedWinner,
        finishedAt: Date.now(),
      };
      setSimulation(finishedSimulation);
      simulationRef.current = finishedSimulation;
      await MatchService.update(current.match.id, {
        status: 'finished',
        finishedAt,
      });
      stopLoop();
      await loadLists();
      return;
    }

    const nextPieces = applyMoveToBoard(current.pieces, move, current.match.boardSize);
    const nextTurn: PieceColor = current.currentTurn === 'red' ? 'black' : 'red';
    const result = checkGameOver(nextPieces, nextTurn, current.match.boardSize, current.consecutiveDraws);
    const nextConsecutiveDraws = result.winner === 'draw' ? current.consecutiveDraws + 1 : 0;
    const nextMoveNumber = current.moveNumber + 1;
    const finishedAtIso = result.over ? new Date().toISOString() : null;

    await MatchMoveService.create({
      matchId: current.match.id,
      moveNumber: nextMoveNumber,
      fromRow: move.fromRow,
      fromCol: move.fromCol,
      toRow: move.toRow,
      toCol: move.toCol,
      capturedPieces: move.capturedPieces ?? [],
      playerType: 'ai',
    });

    await MatchService.update(current.match.id, {
      boardState: JSON.stringify(nextPieces),
      consecutiveDraws: nextConsecutiveDraws,
      status: result.over ? 'finished' : 'active',
      finishedAt: finishedAtIso,
    });

    const updatedMatch: MatchData = {
      ...current.match,
      boardState: JSON.stringify(nextPieces),
      consecutiveDraws: nextConsecutiveDraws,
      status: result.over ? 'finished' : 'active',
      finishedAt: finishedAtIso,
    };

    const nextSimulation: ArenaSimulation = {
      ...current,
      match: updatedMatch,
      pieces: nextPieces,
      currentTurn: nextTurn,
      moveNumber: nextMoveNumber,
      consecutiveDraws: nextConsecutiveDraws,
      winner: result.winner,
      finishedAt: result.over ? Date.now() : null,
    };

    setSimulation(nextSimulation);
    simulationRef.current = nextSimulation;

    if (result.over) {
      stopLoop();
      await loadLists();
      return;
    }

    loopRef.current = setTimeout(() => {
      void runOneSimulationStep();
    }, SPEED_DELAY[speedRef.current]);
  }, [loadLists, stopLoop]);

  const startAIVsAIMatch = async () => {
    if (!currentUser) {
      setMessage('Connectez-vous pour utiliser l’Arène IA.');
      return;
    }

    setMessage(null);
    setLoading(true);
    stopLoop();

    const boardSize = 10;
    const pieceCount = 20;
    const pieces = initPieces(boardSize, pieceCount);

    const created = await MatchService.create({
      player1Id: currentUser.id,
      player2Id: currentUser.id,
      challengeId: null,
      mode: 'ai_arena',
      status: 'active',
      winnerId: null,
      betAmount: 0,
      currency: 'CDF',
      boardSize,
      pieceCount,
      timePerTurn: 0,
      consecutiveDraws: 0,
      boardState: JSON.stringify(pieces),
      finishedAt: null,
    });

    if (!created) {
      setLoading(false);
      setMessage("Impossible de créer la simulation IA vs IA.");
      return;
    }

    const newSimulation: ArenaSimulation = {
      match: created,
      pieces,
      currentTurn: 'red',
      moveNumber: 0,
      consecutiveDraws: 0,
      redDifficulty,
      blackDifficulty,
      startedAt: Date.now(),
      finishedAt: null,
      winner: null,
    };

    setSimulation(newSimulation);
    simulationRef.current = newSimulation;
    setRunning(true);
    setLoading(false);
    setAnalysisMatchId(created.id);
    await loadLists();

    loopRef.current = setTimeout(() => {
      void runOneSimulationStep();
    }, SPEED_DELAY[speedRef.current]);
  };

  const toggleRun = () => {
    const current = simulationRef.current;
    if (!current || current.match.status !== 'active') return;

    if (running) {
      stopLoop();
      return;
    }

    setRunning(true);
    loopRef.current = setTimeout(() => {
      void runOneSimulationStep();
    }, SPEED_DELAY[speedRef.current]);
  };

  const activeArenaSimulation = simulation?.match.status === 'active';

  const analysisMatch = useMemo(
    () => arenaFinishedMatches.find((match) => match.id === analysisMatchId) || null,
    [analysisMatchId, arenaFinishedMatches],
  );
  const analysisPieces = useMemo(
    () => (analysisMatch ? parsePiecesFromState(analysisMatch.boardState) : []),
    [analysisMatch],
  );
  const analysisWinner = useMemo(() => {
    if (!analysisMatch) return null;
    return estimateWinnerFromPieces(analysisPieces);
  }, [analysisMatch, analysisPieces]);

  const analysisStats = useMemo(() => {
    const captures = analysisMoves.reduce((sum, move) => sum + (move.capturedPieces?.length ?? 0), 0);
    return {
      totalMoves: analysisMoves.length,
      captures,
    };
  }, [analysisMoves]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
        <button
          onClick={() => setCurrentView('auth')}
          className="mb-6 px-4 py-2 rounded-xl bg-yellow-500 text-black font-semibold"
        >
          Se connecter
        </button>
        <p className="text-white/70">L’Arène IA est disponible pour les utilisateurs connectés.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pb-24">
      <div className="p-4 border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Retour
          </button>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <Bot size={18} className="text-yellow-400" />
            Arène IA
          </h1>
          <button
            onClick={() => void loadLists()}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Actualiser"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {message && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 text-sm">
            {message}
          </div>
        )}

        <section className="glass rounded-2xl border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Swords size={16} className="text-yellow-400" />
            Humain vs IA
          </h2>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setHumanDifficulty(level)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  humanDifficulty === level
                    ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                    : 'bg-white/5 border-white/10 text-white/70'
                }`}
              >
                {AI_DIFFICULTY_LABELS[level]}
              </button>
            ))}
          </div>
          <button
            onClick={() => initGame('ai', { aiDiff: humanDifficulty })}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold flex items-center justify-center gap-2"
          >
            <Play size={16} />
            Démarrer contre l’IA ({AI_DIFFICULTY_LABELS[humanDifficulty]})
          </button>
        </section>

        <section className="glass rounded-2xl border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Bot size={16} className="text-blue-400" />
            IA vs IA
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">IA Rouge</label>
              <select
                value={redDifficulty}
                onChange={(event) => setRedDifficulty(event.target.value as AIDifficulty)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {AI_DIFFICULTY_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">IA Noire</label>
              <select
                value={blackDifficulty}
                onChange={(event) => setBlackDifficulty(event.target.value as AIDifficulty)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {AI_DIFFICULTY_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSimulationSpeed('normal')}
              className={`flex-1 py-2 rounded-xl border text-sm flex items-center justify-center gap-1 ${
                simulationSpeed === 'normal'
                  ? 'border-green-500/40 bg-green-500/20 text-green-300'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              <Gauge size={14} />
              Vitesse normale
            </button>
            <button
              onClick={() => setSimulationSpeed('rapide')}
              className={`flex-1 py-2 rounded-xl border text-sm flex items-center justify-center gap-1 ${
                simulationSpeed === 'rapide'
                  ? 'border-blue-500/40 bg-blue-500/20 text-blue-300'
                  : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              <FastForward size={14} />
              Avance rapide
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void startAIVsAIMatch()}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Play size={16} />
              Lancer la simulation
            </button>
            <button
              onClick={toggleRun}
              disabled={!activeArenaSimulation}
              className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-40"
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>

          {simulation && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
              <p className="text-sm text-white/80">
                Match: <span className="font-mono text-xs">{simulation.match.id.slice(0, 8)}</span>
              </p>
              <p className="text-xs text-white/60">
                Tour: {colorLabel(simulation.currentTurn)} • Coups: {simulation.moveNumber} • Statut:{' '}
                {simulation.match.status === 'active' ? 'En cours' : 'Terminé'}
              </p>
              <p className="text-xs text-white/60">
                Gagnant: {colorLabel(simulation.winner)}
              </p>
              <ReadOnlyBoard pieces={simulation.pieces} boardSize={simulation.match.boardSize} />
            </div>
          )}
        </section>

        <section className="glass rounded-2xl border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold text-white">Analyse IA</h2>
          <select
            value={analysisMatchId}
            onChange={(event) => setAnalysisMatchId(event.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">Sélectionner un match IA terminé</option>
            {arenaFinishedMatches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.id.slice(0, 8)} • {new Date(match.createdAt).toLocaleString('fr-FR')}
              </option>
            ))}
          </select>

          {analysisMatch && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                  <p className="text-white/40 text-xs">Nombre de coups</p>
                  <p className="font-semibold">{analysisStats.totalMoves}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                  <p className="text-white/40 text-xs">Nombre de captures</p>
                  <p className="font-semibold">{analysisStats.captures}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                  <p className="text-white/40 text-xs">Durée</p>
                  <p className="font-semibold">{formatDuration(analysisMatch.createdAt, analysisMatch.finishedAt)}</p>
                </div>
                <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                  <p className="text-white/40 text-xs">Gagnant</p>
                  <p className="font-semibold">{colorLabel(analysisWinner)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 max-h-64 overflow-y-auto">
                {analysisMoves.length === 0 && (
                  <p className="text-sm text-white/40 p-3">Aucun coup enregistré pour ce match.</p>
                )}
                {analysisMoves.map((move) => (
                  <div key={move.id} className="px-3 py-2 border-b border-white/5 text-sm">
                    <p className="text-white/90">
                      #{move.moveNumber} • ({move.fromRow},{move.fromCol}) → ({move.toRow},{move.toCol})
                    </p>
                    <p className="text-xs text-white/50">
                      Captures: {move.capturedPieces.length} • Joueur: {move.playerType === 'ai' ? 'IA' : 'Humain'} •{' '}
                      {new Date(move.createdAt).toLocaleTimeString('fr-FR')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="glass rounded-2xl border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Eye size={16} className="text-emerald-400" />
            Spectateurs en direct (lecture seule)
          </h2>
          <div className="space-y-2">
            {activeMatches.length === 0 && (
              <p className="text-sm text-white/40">Aucun match actif pour le moment.</p>
            )}
            {activeMatches.map((match) => (
              <button
                key={match.id}
                onClick={() => setSpectatorMatch(match)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                  spectatorMatch?.id === match.id
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <p className="text-sm font-medium">Match {match.id.slice(0, 8)}</p>
                <p className="text-xs text-white/50">
                  Mode: {match.mode === 'ai_arena' ? 'Arène IA' : match.mode === 'challenge' ? 'Défi' : 'En ligne'}
                </p>
              </button>
            ))}
          </div>

          {spectatorMatch && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2"
            >
              <p className="text-sm text-emerald-300 font-semibold">
                Vue spectateur: vous ne pouvez pas jouer ni envoyer de coups.
              </p>
              <p className="text-xs text-white/60">
                Match {spectatorMatch.id.slice(0, 8)} • Statut: {spectatorMatch.status}
              </p>
              <ReadOnlyBoard
                pieces={spectatorPieces}
                boardSize={spectatorMatch.boardSize || 10}
              />
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}

