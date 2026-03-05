import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Swords, Play, ChevronRight, Star, Flame, Users } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  delay: Math.random() * 5,
  duration: 4 + Math.random() * 6,
  size: 2 + Math.random() * 4,
  color: Math.random() > 0.5 ? '#f59e0b' : '#dc2626',
}));

export default function HomeView() {
  const { leaderboard, onlinePlayers, openChallenges, setCurrentView, initGame, isAuthenticated, handleLogoClick, challenges, currentUser } = useGameStore();
  const [tickerIdx, setTickerIdx] = useState(0);

  const tickers = [
    '🏆 Kofi Mensah a gagné 25,000 CDF',
    '⚔️ Amara Diallo défie la communauté',
    '🔥 Fatou Camara: 5 victoires consécutives',
    '💰 Kwame Asante: +50,000 CDF ce mois',
    '🎯 Nouveau record: 145 victoires!',
    '👑 Dame volante: Le roi prend tout le couloir!',
  ];

  useEffect(() => {
    const iv = setInterval(() => setTickerIdx(i => (i + 1) % tickers.length), 3000);
    return () => clearInterval(iv);
  }, []);

  const pendingChallenges = challenges.filter(c => c.status === 'open' && c.toPlayerId === currentUser?.id);
  const activeChallengesCount = challenges.filter(c => c.status === 'open' || c.status === 'accepted').length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden pb-24">
      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PARTICLES.map(p => (
          <div key={p.id} className="absolute rounded-full opacity-60"
            style={{
              left: `${p.x}%`,
              bottom: '-10px',
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              animation: `particle-float ${p.duration}s ${p.delay}s linear infinite`,
            }} />
        ))}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-80 h-80 bg-red-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-yellow-500/5 rounded-full blur-3xl" />
      </div>

      {/* News ticker */}
      <div className="relative z-10 bg-gradient-to-r from-yellow-500/20 via-red-500/10 to-yellow-500/20 border-b border-yellow-500/20 py-2 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p key={tickerIdx}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center text-yellow-300 text-xs font-medium px-4">
            {tickers[tickerIdx]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Hero Section */}
      <div className="relative z-10 text-center pt-10 pb-6 px-4">
        <motion.div
          className="cursor-pointer inline-block"
          onClick={handleLogoClick}
          whileTap={{ scale: 0.95 }}
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
          <div className="text-7xl mb-2 drop-shadow-2xl select-none">♟</div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-5xl font-black font-orbitron mb-2 animate-hero-glow leading-tight">
          <span className="gradient-gold">DAMES</span>
          <br />
          <span className="text-white text-2xl sm:text-3xl">AFRICAINES PRO</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="text-white/50 text-sm mb-2">
          Le championnat de dames africaines le plus compétitif
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="text-white/30 text-xs mb-6">
          👑 La Dame maîtresse du couloir diagonal • CDF & USD
        </motion.p>

        {/* Live stats bar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-4 text-xs text-white/60 mb-8">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            {onlinePlayers.filter(p => p.isOnline).length} en ligne
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">🔥 {leaderboard.length} joueurs</span>
          <span>•</span>
          <span>⚔️ {activeChallengesCount} défis actifs</span>
        </motion.div>

        {/* Main Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={() => isAuthenticated ? setCurrentView('challenge-setup') : setCurrentView('auth')}
            className="flex-1 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-black rounded-2xl text-base shadow-xl shadow-yellow-500/30 hover:shadow-yellow-500/50 transition-all flex items-center justify-center gap-2">
            <Swords size={20} />
            Jouer en Ligne
          </motion.button>

          {!isAuthenticated ? (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              onClick={() => initGame('ai')}
              className="flex-1 py-4 glass border border-white/20 text-white font-bold rounded-2xl text-base hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <Play size={20} />
              vs IA Gratuit
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              onClick={() => setCurrentView('challenge-setup')}
              className="flex-1 py-4 glass border border-white/20 text-white font-bold rounded-2xl text-base hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <Swords size={20} />
              Défis Ouverts
            </motion.button>
          )}
        </div>
      </div>

      {/* Pending Challenges Alert */}
      {pendingChallenges.length > 0 && isAuthenticated && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mx-4 mb-4 relative z-10"
        >
          <button onClick={() => setCurrentView('notifications')}
            className="w-full flex items-center gap-3 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/40 rounded-2xl p-4 hover:from-red-500/30 hover:to-orange-500/30 transition-all animate-pulse-glow">
            <div className="w-10 h-10 bg-red-500/30 rounded-xl flex items-center justify-center shrink-0">
              <Swords size={18} className="text-red-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white font-semibold text-sm">Défi en attente!</p>
              <p className="text-white/60 text-xs">{pendingChallenges[0]?.fromPlayer} vous défie pour {pendingChallenges[0]?.betAmount?.toLocaleString()} {pendingChallenges[0]?.currency}</p>
            </div>
            <ChevronRight size={16} className="text-white/40" />
          </button>
        </motion.div>
      )}

      <div className="px-4 space-y-5 relative z-10">
        {/* 3D Mini Board Preview */}
        {!isAuthenticated && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="glass rounded-2xl p-5 border border-white/5 overflow-hidden relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Flame size={16} className="text-orange-400" />
              Plateau d'aperçu 3D
            </h3>
            <button onClick={() => initGame('ai')} className="text-yellow-400 text-xs flex items-center gap-1 hover:text-yellow-300 transition-colors">
              Jouer <ChevronRight size={12} />
            </button>
          </div>
          <MiniBoard />
        </motion.div>
        )}

        {/* Winners Leaderboard */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Trophy size={16} className="text-yellow-400" />
              Champions du moment
            </h3>
            <button onClick={() => isAuthenticated ? setCurrentView('dashboard') : setCurrentView('auth')}
              className="text-yellow-400 text-xs flex items-center gap-1 hover:text-yellow-300">
              Classement <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {leaderboard.slice(0, 5).map((player, idx) => (
              <motion.div key={player.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + idx * 0.1 }}
                className="glass rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3 hover:bg-white/5 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-black' : idx === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900' : idx === 2 ? 'bg-gradient-to-br from-orange-500 to-red-600 text-white' : 'bg-white/10 text-white/50'}`}>
                  {idx + 1}
                </div>
                <span className="text-2xl">{player.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white text-sm font-semibold truncate">{player.name}</p>
                    {idx === 0 && <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                  </div>
                  <p className="text-white/40 text-xs">{player.wins} victoires</p>
                </div>
                <div className="text-right">
                  <p className="text-yellow-400 text-sm font-bold">{(player.earnings / 1000).toFixed(0)}K</p>
                  <p className="text-white/30 text-xs">CDF</p>
                </div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${player.isOnline ? 'bg-green-400' : 'bg-white/20'}`} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Online Players */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Users size={16} className="text-blue-400" />
              Joueurs en ligne
            </h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {onlinePlayers.filter(p => p.isOnline).map(player => (
              <button key={player.id}
                onClick={() => isAuthenticated ? setCurrentView('challenge-setup') : setCurrentView('auth')}
                className="flex flex-col items-center gap-2 shrink-0 p-3 glass rounded-2xl border border-white/5 hover:border-yellow-500/30 hover:bg-white/5 transition-all min-w-[80px]">
                <div className="relative">
                  <span className="text-3xl">{player.avatar}</span>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0a0a0f]" />
                </div>
                <p className="text-white text-xs font-medium text-center leading-tight">{player.name.split(' ')[0]}</p>
                <p className="text-yellow-400 text-xs">{player.wins}V</p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Défis ouverts */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Swords size={16} className="text-red-400" />
              Défis ouverts
            </h3>
          </div>
          <div className="space-y-2">
            {openChallenges.slice(0, 3).map((challenge) => (
              <div key={challenge.id} className="glass rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{challenge.fromPlayer}</p>
                  <p className="text-white/30 text-xs">{challenge.boardSize}×{challenge.boardSize} • {challenge.pieceCount} pions</p>
                </div>
                <div className="text-right">
                  <p className="text-yellow-400 text-xs font-bold">{challenge.betAmount.toLocaleString()} {challenge.currency}</p>
                  <p className="text-white/30 text-xs">Expire le {challenge.expiresAt.toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              </div>
            ))}
            {openChallenges.length === 0 && (
              <div className="glass rounded-xl px-4 py-3 border border-white/5 text-white/40 text-sm">
                Aucun défi ouvert pour le moment.
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function MiniBoard() {
  const cells = Array.from({ length: 100 }, (_, i) => i);
  const pieces = [
    { pos: 1, color: '#dc2626' }, { pos: 3, color: '#dc2626' }, { pos: 5, color: '#dc2626' },
    { pos: 7, color: '#dc2626' }, { pos: 9, color: '#dc2626' },
    { pos: 10, color: '#dc2626' }, { pos: 12, color: '#dc2626' }, { pos: 14, color: '#dc2626' },
    { pos: 16, color: '#dc2626' }, { pos: 18, color: '#dc2626' },
    { pos: 21, color: '#dc2626' }, { pos: 23, color: '#dc2626' }, { pos: 25, color: '#dc2626' },
    { pos: 27, color: '#dc2626' }, { pos: 29, color: '#dc2626' },
    { pos: 70, color: '#1f2937' }, { pos: 72, color: '#1f2937' }, { pos: 74, color: '#1f2937' },
    { pos: 76, color: '#1f2937' }, { pos: 78, color: '#1f2937' },
    { pos: 81, color: '#1f2937' }, { pos: 83, color: '#1f2937' }, { pos: 85, color: '#1f2937' },
    { pos: 87, color: '#1f2937' }, { pos: 89, color: '#1f2937' },
    { pos: 90, color: '#1f2937' }, { pos: 92, color: '#1f2937' }, { pos: 94, color: '#1f2937' },
    { pos: 96, color: '#1f2937' }, { pos: 98, color: '#1f2937' },
  ];

  return (
    <div className="board-3d-container">
      <div className="board-3d rounded-xl overflow-hidden mx-auto"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', width: '100%', maxWidth: '300px' }}>
        {cells.map(i => {
          const row = Math.floor(i / 10);
          const col = i % 10;
          const isDark = (row + col) % 2 === 1;
          const piece = isDark ? pieces.find(p => p.pos === i) : null;
          return (
            <div key={i} className="aspect-square flex items-center justify-center"
              style={{ background: isDark ? '#1a0a0a' : '#7f1d1d' }}>
              {piece && (
                <div className="w-3/4 h-3/4 rounded-full shadow"
                  style={{ background: `radial-gradient(circle at 35% 35%, ${piece.color === '#dc2626' ? '#f87171' : '#4b5563'}, ${piece.color})` }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
