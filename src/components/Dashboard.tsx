import { motion } from 'framer-motion';
import { Trophy, TrendingUp, Target, Users, Star, ChevronRight } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export default function Dashboard() {
  const {
    currentUser, leaderboard, challenges, setCurrentView,
    acceptChallenge, declineChallenge, transactions, adminSettings,
  } = useGameStore();

  if (!currentUser) return null;

  const winRate = currentUser.totalWins + currentUser.totalLosses > 0
    ? Math.round((currentUser.totalWins / (currentUser.totalWins + currentUser.totalLosses)) * 100)
    : 0;

  const stats = [
    { label: 'Victoires', value: currentUser.totalWins, icon: Trophy, color: 'from-yellow-500 to-orange-500', bg: 'bg-yellow-500/10' },
    { label: 'Défaites', value: currentUser.totalLosses, icon: Target, color: 'from-red-500 to-pink-500', bg: 'bg-red-500/10' },
    { label: 'Nuls', value: currentUser.totalDraws, icon: Users, color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10' },
    { label: 'Gains Total', value: `${currentUser.totalEarnings.toLocaleString()} ${adminSettings.defaultCurrency}`, icon: TrendingUp, color: 'from-green-500 to-emerald-500', bg: 'bg-green-500/10' },
  ];

  const pendingChallenges = challenges.filter(c => c.status === 'open' && c.toPlayerId === currentUser.id);
  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-black/60 to-transparent p-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-white/50 text-sm">Tableau de bord</p>
            <h1 className="text-2xl font-bold text-white">
              {currentUser.firstName} {currentUser.name} <span className="text-2xl">{currentUser.avatar}</span>
            </h1>
          </div>
          <div className="text-right">
            <p className="text-white/50 text-xs">Taux de victoire</p>
            <p className="text-2xl font-bold gradient-gold">{winRate}%</p>
          </div>
        </div>

        {/* Balance Card */}
        <div className="wallet-card rounded-2xl p-5 mb-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full -translate-y-8 translate-x-8 blur-2xl" />
          <p className="text-white/50 text-sm mb-1">Solde du Wallet</p>
          <p className="text-3xl font-bold font-orbitron gradient-gold">
            {currentUser.balance.toLocaleString()} {adminSettings.defaultCurrency}
          </p>
          <div className="flex gap-3 mt-4">
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('wallet')}
              className="flex-1 py-2 bg-yellow-500 text-black font-semibold rounded-xl text-sm hover:bg-yellow-400 transition-colors">
              💳 Dépôt
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('wallet')}
              className="flex-1 py-2 bg-white/10 text-white font-semibold rounded-xl text-sm hover:bg-white/20 transition-colors">
              📤 Retrait
            </motion.button>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat, i) => (
            <motion.div key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="dashboard-card glass rounded-2xl p-4 border border-white/5">
              <div className={`w-9 h-9 ${stat.bg} rounded-xl flex items-center justify-center mb-3`}>
                <stat.icon size={18} className="text-white/70" />
              </div>
              <p className="text-white/50 text-xs">{stat.label}</p>
              <p className="text-white font-bold text-lg">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Pending Challenges */}
        {pendingChallenges.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Target size={16} className="text-red-400" />
                Défis reçus
              </h3>
              <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/30">{pendingChallenges.length}</span>
            </div>
            <div className="space-y-3">
              {pendingChallenges.map(c => (
                <motion.div key={c.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  className="glass rounded-2xl p-4 border border-red-500/20">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-semibold text-sm">{c.fromPlayer}</p>
                      <p className="text-white/40 text-xs">{c.pieceCount} pions • {c.boardSize}×{c.boardSize} • {c.timePerTurn}s/tour</p>
                    </div>
                    <div className="text-right">
                      <p className="text-yellow-400 font-bold">{c.betAmount.toLocaleString()}</p>
                      <p className="text-white/30 text-xs">{c.currency}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => declineChallenge(c.id)}
                      className="flex-1 py-2 bg-white/5 text-white/60 rounded-xl text-sm hover:bg-red-500/20 hover:text-red-400 transition-colors">
                      Refuser
                    </button>
                    <button onClick={() => acceptChallenge(c.id)}
                      className="flex-1 py-2 bg-yellow-500 text-black font-bold rounded-xl text-sm hover:bg-yellow-400 transition-colors">
                      Accepter
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Star size={16} className="text-yellow-400" />
              Classement
            </h3>
            <button className="text-yellow-400 text-xs hover:text-yellow-300 flex items-center gap-1">
              Voir tout <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {leaderboard.slice(0, 5).map((player, idx) => (
              <div key={player.id} className="flex items-center gap-3 glass rounded-xl px-4 py-3 border border-white/5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-300 text-gray-800' : idx === 2 ? 'bg-orange-600 text-white' : 'bg-white/10 text-white/60'}`}>
                  {idx + 1}
                </div>
                <div className="text-xl">{player.avatar}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{player.name}</p>
                  <p className="text-white/40 text-xs">{player.wins} victoires</p>
                </div>
                <div className="text-right">
                  <p className="text-yellow-400 text-sm font-bold">{player.earnings.toLocaleString()}</p>
                  <p className="text-white/30 text-xs">CDF</p>
                </div>
                <div className={`w-2 h-2 rounded-full ${player.isOnline ? 'bg-green-400' : 'bg-white/20'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div>
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-400" />
            Transactions récentes
          </h3>
          <div className="space-y-2">
            {recentTransactions.length === 0 && (
              <p className="text-white/30 text-sm text-center py-4">Aucune transaction</p>
            )}
            {recentTransactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 glass rounded-xl px-4 py-3 border border-white/5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${tx.amount > 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  {tx.type === 'win' ? '🏆' : tx.type === 'deposit' ? '💳' : tx.type === 'loss' ? '❌' : '📤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{tx.description}</p>
                  <p className="text-white/40 text-xs">{tx.timestamp.toLocaleDateString('fr')}</p>
                </div>
                <p className={`font-bold text-sm ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} {tx.currency}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
