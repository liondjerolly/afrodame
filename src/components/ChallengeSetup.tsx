import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  Swords,
  XCircle,
} from 'lucide-react';
import { useGameStore, type Currency, type OnlinePlayer } from '../store/gameStore';

function formatExpiration(expiresAt: Date): string {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return 'Expiré';

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes} min`;
}

export default function ChallengeSetup() {
  const {
    currentUser,
    isAuthenticated,
    setCurrentView,
    adminSettings,
    onlinePlayers,
    challenges,
    openChallenges,
    sendChallenge,
    acceptChallenge,
    cancelChallenge,
    loadChallenges,
    loadOpenChallenges,
    loadOnlinePlayers,
    hasEnoughFunds,
  } = useGameStore();

  const [targetMode, setTargetMode] = useState<'public' | 'direct'>('public');
  const [selectedOpponentId, setSelectedOpponentId] = useState('');
  const [betAmount, setBetAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(adminSettings.defaultCurrency);
  const [boardSize, setBoardSize] = useState(10);
  const [pieceCount, setPieceCount] = useState(20);
  const [timePerTurn, setTimePerTurn] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [searchWager, setSearchWager] = useState('');
  const [minWager, setMinWager] = useState('');
  const [maxWager, setMaxWager] = useState('');
  const [sortWager, setSortWager] = useState<'desc' | 'asc'>('desc');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentView('auth');
      return;
    }

    void loadChallenges();
    void loadOpenChallenges();
    void loadOnlinePlayers();
    const interval = setInterval(() => {
      void loadChallenges();
      void loadOpenChallenges();
    }, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, setCurrentView, loadChallenges, loadOpenChallenges, loadOnlinePlayers]);

  useEffect(() => {
    if (boardSize === 10) setPieceCount(20);
    else if (boardSize === 8) setPieceCount(12);
    else setPieceCount(9);
  }, [boardSize]);

  if (!currentUser) return null;

  const opponentOptions = onlinePlayers.filter((p) => p.id !== currentUser.id && p.isOnline);
  const myOpenChallenges = challenges.filter(
    (c) => c.fromPlayerId === currentUser.id && c.status === 'open',
  );
  const incomingOpenChallenges = challenges.filter(
    (c) => c.toPlayerId === currentUser.id && c.status === 'open',
  );

  const filteredOpenChallenges = useMemo(() => {
    let list = openChallenges.filter(
      (c) => c.status === 'open' && c.fromPlayerId !== currentUser.id,
    );

    const normalizedSearch = searchWager.replace(/[^\d.]/g, '').trim();
    if (normalizedSearch) {
      list = list.filter((c) => {
        const amountStr = String(c.betAmount);
        return amountStr.includes(normalizedSearch);
      });
    }

    const min = Number(minWager);
    const max = Number(maxWager);

    if (!Number.isNaN(min) && minWager !== '') {
      list = list.filter((c) => c.betAmount >= min);
    }
    if (!Number.isNaN(max) && maxWager !== '') {
      list = list.filter((c) => c.betAmount <= max);
    }

    list = [...list].sort((a, b) => (sortWager === 'desc' ? b.betAmount - a.betAmount : a.betAmount - b.betAmount));
    return list;
  }, [currentUser.id, maxWager, minWager, openChallenges, searchWager, sortWager]);

  const refreshAll = async () => {
    setRefreshing(true);
    await loadChallenges();
    await loadOpenChallenges();
    await loadOnlinePlayers();
    setRefreshing(false);
  };

  const handleCreateChallenge = async () => {
    setMessage(null);

    const parsedBet = Number(betAmount);
    if (!Number.isFinite(parsedBet) || parsedBet <= 0) {
      setMessage({ type: 'err', text: 'Saisissez une mise valide.' });
      return;
    }

    if (parsedBet < adminSettings.minBet || parsedBet > adminSettings.maxBet) {
      setMessage({
        type: 'err',
        text: `La mise doit être comprise entre ${adminSettings.minBet.toLocaleString()} et ${adminSettings.maxBet.toLocaleString()} ${currency}.`,
      });
      return;
    }

    if (!hasEnoughFunds(parsedBet, currency, false)) {
      setMessage({ type: 'err', text: 'Solde insuffisant dans le wallet principal.' });
      return;
    }

    let opponent: OnlinePlayer | null = null;
    if (targetMode === 'direct') {
      opponent = opponentOptions.find((p) => p.id === selectedOpponentId) || null;
      if (!opponent) {
        setMessage({ type: 'err', text: 'Sélectionnez un adversaire en ligne.' });
        return;
      }
    }

    setSubmitting(true);
    await sendChallenge(opponent, parsedBet, currency, pieceCount, boardSize, timePerTurn, false);
    await loadChallenges();
    await loadOpenChallenges();
    setSubmitting(false);
    setBetAmount('');
    setMessage({
      type: 'ok',
      text:
        targetMode === 'direct'
          ? 'Défi direct envoyé. En attente d’acceptation.'
          : 'Défi public publié. En attente d’un adversaire.',
    });
  };

  const handleAccept = async (challengeId: string) => {
    setActionLoadingId(challengeId);
    await acceptChallenge(challengeId);
    await loadChallenges();
    await loadOpenChallenges();
    setActionLoadingId(null);
  };

  const handleCancel = async (challengeId: string) => {
    setActionLoadingId(challengeId);
    await cancelChallenge(challengeId);
    await loadChallenges();
    await loadOpenChallenges();
    setActionLoadingId(null);
  };

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
            <Swords size={18} className="text-yellow-400" />
            Défis en ligne
          </h1>
          <button
            onClick={refreshAll}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            title="Actualiser"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        <div className="glass rounded-2xl border border-white/10 p-4 space-y-4">
          <h2 className="font-semibold text-white">Créer un défi</h2>

          <div className="flex gap-2">
            <button
              onClick={() => setTargetMode('public')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
                targetMode === 'public'
                  ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400'
                  : 'bg-white/5 border border-white/10 text-white/60'
              }`}
            >
              Défi public
            </button>
            <button
              onClick={() => setTargetMode('direct')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
                targetMode === 'direct'
                  ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400'
                  : 'bg-white/5 border border-white/10 text-white/60'
              }`}
            >
              Défi direct
            </button>
          </div>

          {targetMode === 'direct' && (
            <div>
              <label className="block text-xs text-white/60 mb-1">Adversaire en ligne</label>
              <select
                value={selectedOpponentId}
                onChange={(e) => setSelectedOpponentId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">Sélectionnez un joueur</option>
                {opponentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Mise</label>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Ex: 5000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Devise</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="CDF">CDF</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Plateau</label>
              <select
                value={boardSize}
                onChange={(e) => setBoardSize(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value={10}>10x10</option>
                <option value={8}>8x8</option>
                <option value={6}>6x6</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Pions</label>
              <input
                type="number"
                value={pieceCount}
                readOnly
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Temps/tour</label>
              <select
                value={timePerTurn}
                onChange={(e) => setTimePerTurn(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value={30}>30s</option>
                <option value={45}>45s</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-white/40">
            La partie ne démarre qu’après acceptation. Les défis expirent automatiquement après 24 heures.
          </p>

          {message && (
            <div
              className={`rounded-xl p-3 text-sm flex items-center gap-2 ${
                message.type === 'ok'
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}
            >
              {message.type === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {message.text}
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleCreateChallenge}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 text-black disabled:opacity-60"
          >
            {submitting ? 'Publication du défi...' : 'Publier le défi'}
          </motion.button>
        </div>

        <div className="glass rounded-2xl border border-white/10 p-4 space-y-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Filter size={16} className="text-blue-400" />
            Recherche des défis ouverts (par mise)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={searchWager}
                onChange={(e) => setSearchWager(e.target.value)}
                placeholder="Rechercher un montant de mise"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm"
              />
            </div>
            <input
              type="number"
              value={minWager}
              onChange={(e) => setMinWager(e.target.value)}
              placeholder="Mise min"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
            />
            <input
              type="number"
              value={maxWager}
              onChange={(e) => setMaxWager(e.target.value)}
              placeholder="Mise max"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
            />
            <select
              value={sortWager}
              onChange={(e) => setSortWager(e.target.value as 'desc' | 'asc')}
              className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="desc">Trier par mise: plus élevée d’abord</option>
              <option value="asc">Trier par mise: plus faible d’abord</option>
            </select>
          </div>

          <div className="space-y-2">
            {filteredOpenChallenges.length === 0 && (
              <p className="text-white/40 text-sm py-4 text-center">Aucun défi ouvert correspondant aux filtres.</p>
            )}
            {filteredOpenChallenges.map((challenge) => (
              <div key={challenge.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{challenge.fromPlayer}</p>
                    <p className="text-xs text-white/50">
                      {challenge.boardSize}x{challenge.boardSize} • {challenge.pieceCount} pions • {challenge.timePerTurn}s/tour
                    </p>
                    <p className="text-xs text-white/40 mt-1 flex items-center gap-1">
                      <Clock3 size={12} />
                      Expire dans {formatExpiration(challenge.expiresAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-yellow-400 font-bold text-sm">
                      {challenge.betAmount.toLocaleString()} {challenge.currency}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => handleAccept(challenge.id)}
                    disabled={actionLoadingId === challenge.id}
                    className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-400 transition-colors disabled:opacity-60"
                  >
                    {actionLoadingId === challenge.id ? 'Connexion...' : 'Accepter'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl border border-white/10 p-4">
            <h2 className="font-semibold text-white mb-3">Mes défis ouverts</h2>
            <div className="space-y-2">
              {myOpenChallenges.length === 0 && (
                <p className="text-white/40 text-sm">Aucun défi ouvert de votre côté.</p>
              )}
              {myOpenChallenges.map((challenge) => (
                <div key={challenge.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-sm text-white font-semibold">
                    {challenge.betAmount.toLocaleString()} {challenge.currency}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    {challenge.toPlayerId ? 'Défi direct' : 'Défi public'} • expire dans {formatExpiration(challenge.expiresAt)}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleCancel(challenge.id)}
                      disabled={actionLoadingId === challenge.id}
                      className="px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-60"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-4">
            <h2 className="font-semibold text-white mb-3">Défis reçus en attente</h2>
            <div className="space-y-2">
              {incomingOpenChallenges.length === 0 && (
                <p className="text-white/40 text-sm">Aucun défi reçu pour le moment.</p>
              )}
              {incomingOpenChallenges.map((challenge) => (
                <div key={challenge.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-sm text-white font-semibold">{challenge.fromPlayer}</p>
                  <p className="text-xs text-white/40 mt-1">
                    Mise: {challenge.betAmount.toLocaleString()} {challenge.currency} • expire dans {formatExpiration(challenge.expiresAt)}
                  </p>
                  <div className="mt-3 flex gap-2 justify-end">
                    <button
                      onClick={() => handleCancel(challenge.id)}
                      disabled={actionLoadingId === challenge.id}
                      className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10"
                    >
                      Refuser
                    </button>
                    <button
                      onClick={() => handleAccept(challenge.id)}
                      disabled={actionLoadingId === challenge.id}
                      className="px-3 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-400 disabled:opacity-60"
                    >
                      Accepter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
