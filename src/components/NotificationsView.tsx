import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { pollChallengesNow } from '../lib/challengeRealtime';

export default function NotificationsView() {
  const {
    notifications, challenges, currentUser,
    markNotificationsRead, acceptChallenge, declineChallenge,
    loadChallenges, loadNotifications,
  } = useGameStore();

  const [filter, setFilter] = useState<'all' | 'challenges' | 'wallet' | 'system'>('all');
  const [accepting, setAccepting] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pulseNew, setPulseNew] = useState(false);

  // Marquer comme lu à l'ouverture
  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  // Rechargement manuel forcé
  const forceRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadChallenges();
    await loadNotifications();
    if (currentUser) {
      await pollChallengesNow(currentUser.id, async () => {
        await loadChallenges();
        await loadNotifications();
      });
    }
    setLastRefresh(Date.now());
    setIsRefreshing(false);
  }, [loadChallenges, loadNotifications, currentUser]);

  // Rechargement automatique toutes les 3 secondes
  useEffect(() => {
    const interval = setInterval(async () => {
      if (currentUser) {
        await loadChallenges();
        await loadNotifications();
        setLastRefresh(Date.now());
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [currentUser, loadChallenges, loadNotifications]);

  // Détecter les nouveaux défis entrants
  const pendingChallenges = challenges.filter(
    c => c.toPlayerId === currentUser?.id && c.status === 'open'
  );

  useEffect(() => {
    if (pendingChallenges.length > 0) {
      setPulseNew(true);
      const t = setTimeout(() => setPulseNew(false), 3000);
      return () => clearTimeout(t);
    }
  }, [pendingChallenges.length]);

  const handleAccept = async (id: string) => {
    setAccepting(id);
    await acceptChallenge(id);
    setAccepting(null);
  };

  const handleDecline = async (id: string) => {
    await declineChallenge(id);
    await loadChallenges();
  };

  const filteredNotifs = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'challenges') return n.type === 'challenge';
    if (filter === 'wallet') return ['deposit', 'withdraw', 'win', 'loss'].includes(n.type);
    if (filter === 'system') return n.type === 'system';
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'challenge': return '⚔️';
      case 'win': return '🏆';
      case 'loss': return '💔';
      case 'deposit': return '💰';
      case 'withdraw': return '💸';
      case 'chat': return '💬';
      default: return '🔔';
    }
  };

  const getBg = (type: string, read: boolean) => {
    const base = read ? 'opacity-70' : '';
    switch (type) {
      case 'challenge': return `bg-orange-900/40 border-orange-500/50 ${base}`;
      case 'win': return `bg-green-900/40 border-green-500/50 ${base}`;
      case 'loss': return `bg-red-900/40 border-red-500/50 ${base}`;
      case 'deposit': return `bg-blue-900/40 border-blue-500/50 ${base}`;
      case 'withdraw': return `bg-purple-900/40 border-purple-500/50 ${base}`;
      default: return `bg-gray-800/40 border-gray-600/50 ${base}`;
    }
  };

  const mySentChallenges = challenges.filter(
    c => c.fromPlayerId === currentUser?.id && c.status === 'open'
  );

  const acceptedChallenges = challenges.filter(
    c => (c.fromPlayerId === currentUser?.id || c.toPlayerId === currentUser?.id) && c.status === 'accepted'
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🔔 Notifications
            {pendingChallenges.length > 0 && (
              <span className={`bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold ${pulseNew ? 'animate-bounce' : ''}`}>
                {pendingChallenges.length} défi{pendingChallenges.length > 1 ? 's' : ''}!
              </span>
            )}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Actualisé: {new Date(lastRefresh).toLocaleTimeString()} • Auto 3s
          </p>
        </div>
        <button
          onClick={forceRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all"
        >
          <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
          {isRefreshing ? 'Chargement...' : 'Actualiser'}
        </button>
      </div>

      {/* ═══ SECTION DÉFIS EN ATTENTE — PRIORITÉ MAX ═══ */}
      {pendingChallenges.length > 0 && (
        <div className={`mb-6 ${pulseNew ? 'animate-pulse' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
            <h2 className="text-lg font-bold text-red-400">
              ⚔️ Défis en attente ({pendingChallenges.length})
            </h2>
          </div>

          <div className="space-y-3">
            {pendingChallenges.map((challenge) => (
              <div
                key={challenge.id}
                className="bg-gradient-to-r from-orange-900/60 to-red-900/60 border-2 border-orange-400 rounded-2xl p-4 shadow-xl shadow-orange-900/30"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">⚔️</span>
                      <span className="text-white font-bold text-lg">{challenge.fromPlayer}</span>
                      <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                        NOUVEAU
                      </span>
                    </div>
                    <p className="text-orange-200 text-sm">vous défie à une partie!</p>
                  </div>
                  <span className="text-gray-400 text-xs">
                    {new Date(challenge.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* Détails du défi */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-black/30 rounded-lg p-2 text-center">
                    <div className="text-yellow-400 font-bold text-lg">
                      {challenge.betAmount.toLocaleString()}
                    </div>
                    <div className="text-gray-400 text-xs">{challenge.currency} - Mise</div>
                  </div>
                  <div className="bg-black/30 rounded-lg p-2 text-center">
                    <div className="text-blue-400 font-bold text-lg">
                      {(challenge.betAmount * 2 * 0.98).toLocaleString()}
                    </div>
                    <div className="text-gray-400 text-xs">{challenge.currency} - Gain potentiel</div>
                  </div>
                  <div className="bg-black/30 rounded-lg p-2 text-center">
                    <div className="text-green-400 font-bold">{challenge.boardSize}×{challenge.boardSize}</div>
                    <div className="text-gray-400 text-xs">Plateau</div>
                  </div>
                  <div className="bg-black/30 rounded-lg p-2 text-center">
                    <div className="text-purple-400 font-bold">{challenge.timePerTurn}s</div>
                    <div className="text-gray-400 text-xs">Par tour</div>
                  </div>
                </div>

                {/* Boutons Accepter / Refuser */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAccept(challenge.id)}
                    disabled={accepting === challenge.id}
                    className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-3 rounded-xl font-bold text-base transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-green-900/50"
                  >
                    {accepting === challenge.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⚙️</span> Démarrage...
                      </span>
                    ) : '✅ Accepter le défi'}
                  </button>
                  <button
                    onClick={() => handleDecline(challenge.id)}
                    disabled={accepting === challenge.id}
                    className="flex-1 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 text-white py-3 rounded-xl font-bold text-base transition-all transform hover:scale-105 active:scale-95"
                  >
                    ❌ Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ DÉFIS ENVOYÉS EN ATTENTE ═══ */}
      {mySentChallenges.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-bold text-yellow-400 mb-3 flex items-center gap-2">
            ⏳ Défis envoyés en attente ({mySentChallenges.length})
          </h2>
          <div className="space-y-2">
            {mySentChallenges.map((challenge) => (
              <div
                key={challenge.id}
                className="bg-yellow-900/30 border border-yellow-600/40 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-white font-medium text-sm">
                    Défi vers {challenge.toPlayerId ? `${challenge.toPlayerId.slice(0, 8)}...` : 'la communauté'}
                  </div>
                  <div className="text-yellow-300 text-xs">
                    Mise: {challenge.betAmount.toLocaleString()} {challenge.currency} • En attente de réponse
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  <span className="text-yellow-400 text-xs font-medium">En attente</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ DÉFIS ACCEPTÉS (PARTIE EN COURS) ═══ */}
      {acceptedChallenges.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-bold text-green-400 mb-3 flex items-center gap-2">
            🎮 Parties en cours ({acceptedChallenges.length})
          </h2>
          <div className="space-y-2">
            {acceptedChallenges.map((challenge) => (
              <div
                key={challenge.id}
                className="bg-green-900/30 border border-green-600/40 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-white font-medium text-sm">
                    {challenge.fromPlayerId === currentUser?.id
                      ? `Défi envoyé`
                      : `Défi de ${challenge.fromPlayer}`}
                  </div>
                  <div className="text-green-300 text-xs">
                    Mise: {challenge.betAmount.toLocaleString()} {challenge.currency}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 text-xs font-bold">EN COURS</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FILTRES NOTIFICATIONS ═══ */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(['all', 'challenges', 'wallet', 'system'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? `🔔 Tout (${notifications.length})`
              : f === 'challenges' ? `⚔️ Défis (${notifications.filter(n => n.type === 'challenge').length})`
              : f === 'wallet' ? `💰 Wallet (${notifications.filter(n => ['deposit','withdraw','win','loss'].includes(n.type)).length})`
              : `⚙️ Système (${notifications.filter(n => n.type === 'system').length})`}
          </button>
        ))}
      </div>

      {/* ═══ LISTE NOTIFICATIONS ═══ */}
      {filteredNotifs.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔔</div>
          <p className="text-gray-400 text-lg">Aucune notification</p>
          <p className="text-gray-600 text-sm mt-2">
            Les défis, gains et alertes apparaissent ici en temps réel
          </p>
          <button
            onClick={forceRefresh}
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-medium transition-all"
          >
            🔄 Vérifier maintenant
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifs.map((notif) => (
            <div
              key={notif.id}
              className={`border rounded-xl p-4 transition-all ${getBg(notif.type, notif.read)} ${!notif.read ? 'ring-1 ring-yellow-500/30' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{getIcon(notif.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-white text-sm truncate">{notif.title}</span>
                    {!notif.read && (
                      <span className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{notif.message}</p>
                  {notif.amount && (
                    <div className={`mt-2 text-sm font-bold ${
                      notif.type === 'win' || notif.type === 'deposit' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {notif.type === 'win' || notif.type === 'deposit' ? '+' : '-'}
                      {notif.amount.toLocaleString()} {notif.type === 'win' ? 'CDF' : ''}
                    </div>
                  )}
                  <div className="mt-2 text-gray-500 text-xs">
                    {notif.timestamp.toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Indicateur temps réel */}
      <div className="fixed bottom-20 right-4 flex items-center gap-2 bg-gray-800/90 backdrop-blur px-3 py-2 rounded-full text-xs text-gray-400 border border-gray-700">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        Temps réel actif
      </div>
    </div>
  );
}
