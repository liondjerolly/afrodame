import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import HomeView from './components/HomeView';
import AuthView from './components/AuthView';
import GameBoard from './components/GameBoard';
import Dashboard from './components/Dashboard';
import WalletView from './components/WalletView';
import NotificationsView from './components/NotificationsView';
import AdminPanel from './components/AdminPanel';
import ChallengeSetup from './components/ChallengeSetup';
import ArenaIA from './components/ArenaIA';
import { Home, LayoutDashboard, Wallet, Bell, Swords, LogIn, Bot } from 'lucide-react';

export default function App() {
  const {
    currentView, setCurrentView, isAuthenticated, currentUser,
    notifications, logout, gameState, initDB,
  } = useGameStore();

  useEffect(() => {
    initDB();
  }, [initDB]);

  // Route legere: /ia <-> vue arena-ia
  useEffect(() => {
    if (window.location.pathname === '/ia' && currentView !== 'arena-ia') {
      setCurrentView('arena-ia');
    }
  }, [currentView, setCurrentView]);

  useEffect(() => {
    const onPopState = () => {
      setCurrentView(window.location.pathname === '/ia' ? 'arena-ia' : 'home');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setCurrentView]);

  useEffect(() => {
    if (window.location.pathname === '/ia' && currentView !== 'arena-ia') {
      return;
    }
    const targetPath = currentView === 'arena-ia' ? '/ia' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.replaceState({}, '', targetPath);
    }
  }, [currentView]);

  const unreadNotifs = notifications.filter((n) => !n.read).length;
  const showNav = currentView !== 'game' && currentView !== 'admin';

  const navItems = isAuthenticated
    ? [
        { id: 'home', icon: Home, label: 'Accueil' },
        { id: 'dashboard', icon: LayoutDashboard, label: 'Tableau' },
        { id: 'challenge-setup', icon: Swords, label: 'Défi' },
        { id: 'arena-ia', icon: Bot, label: 'Arène IA' },
        { id: 'wallet', icon: Wallet, label: 'Portefeuille' },
        { id: 'notifications', icon: Bell, label: 'Notifications', badge: unreadNotifs },
      ]
    : [
        { id: 'home', icon: Home, label: 'Accueil' },
        { id: 'auth', icon: LogIn, label: 'Connexion' },
      ];

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] max-w-lg mx-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="min-h-screen"
        >
          {currentView === 'home' && <HomeView />}
          {currentView === 'auth' && <AuthView />}
          {currentView === 'game' && <GameBoard />}
          {currentView === 'dashboard' && <Dashboard />}
          {currentView === 'wallet' && <WalletView />}
          {currentView === 'notifications' && <NotificationsView />}
          {currentView === 'admin' && <AdminPanel />}
          {currentView === 'challenge-setup' && <ChallengeSetup />}
          {currentView === 'arena-ia' && <ArenaIA />}
        </motion.div>
      </AnimatePresence>

      {showNav && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50"
        >
          <div className="glass-dark border-t border-white/10 px-2 py-2">
            <div className="flex items-center justify-around">
              {navItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id as Parameters<typeof setCurrentView>[0])}
                    className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all relative ${
                      isActive ? 'text-yellow-400' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 bg-yellow-500/10 rounded-xl border border-yellow-500/20"
                      />
                    )}
                    <div className="relative">
                      <item.icon size={20} className="relative z-10" />
                      {'badge' in item && item.badge && item.badge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold z-20">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-medium relative z-10 ${isActive ? 'text-yellow-400' : ''}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}

              {isAuthenticated && currentUser && (
                <button
                  onClick={() => {
                    if (confirm(`Déconnexion de ${currentUser.firstName}?`)) logout();
                  }}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-white/40 hover:text-red-400 transition-colors"
                >
                  <span className="text-lg">{currentUser.avatar}</span>
                  <span className="text-xs font-medium">{currentUser.firstName}</span>
                </button>
              )}
            </div>
          </div>
          <div className="h-safe-bottom bg-[#0a0a0f]/90" />
        </motion.div>
      )}

      {gameState && !gameState.gameOver && currentView !== 'game' && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setCurrentView('game')}
          className="fixed top-4 right-4 z-50 bg-gradient-to-br from-yellow-500 to-orange-500 text-black p-3 rounded-2xl shadow-xl shadow-yellow-500/40 flex items-center gap-2 border border-yellow-400/30"
        >
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs font-black">Partie en cours</span>
        </motion.button>
      )}
    </div>
  );
}
