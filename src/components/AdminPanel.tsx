import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Clock, Percent, DollarSign, ArrowLeft, Settings,
  Users, Sliders, Trash2, Eye, EyeOff, Lock,
  RefreshCw, WifiOff, Wifi, Sword, CheckCircle, XCircle,
  AlertCircle, TrendingUp, Activity, UserX, Key, Save,
  ChevronRight, Play, ArrowDownCircle, ArrowUpCircle,
  PlusCircle, MinusCircle, History,
} from 'lucide-react';
import { useGameStore, type Currency } from '../store/gameStore';
import {
  AdminService, ChallengeService, AdminWalletService,
  SubAdminService,
  type PlayerData, type ChallengeData,
  type AdminWalletData, type AdminWalletTransaction,
  type SubAdminData,
} from '../lib/database';
import AdminSettings from './AdminSettings';

// ── Mot de passe admin par défaut ──────────────────────────────────────────────
const ADMIN_DEFAULT_PASSWORD = '123';
const ADMIN_PASSWORD_KEY = 'dames_admin_password';

function getAdminPassword(): string {
  return localStorage.getItem(ADMIN_PASSWORD_KEY) || ADMIN_DEFAULT_PASSWORD;
}
function setAdminPassword(pw: string): void {
  localStorage.setItem(ADMIN_PASSWORD_KEY, pw);
}

// ── Lock screen ────────────────────────────────────────────────────────────────
function AdminLock({ onUnlock }: { onUnlock: (subAdmin?: SubAdminData) => void }) {
  const { setCurrentView } = useGameStore();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const [shake, setShake] = useState(false);

  const tryUnlock = () => {
    // Vérifier mot de passe principal
    if (pw === getAdminPassword()) {
      onUnlock(); // admin principal — accès complet
      return;
    }
    // Vérifier mot de passe d'un sous-admin
    const subAdmin = SubAdminService.verifyAccess(pw);
    if (subAdmin) {
      SubAdminService.recordLogin(subAdmin.id);
      onUnlock(subAdmin); // sous-admin — accès limité
      return;
    }
    setErr('Mot de passe incorrect');
    setShake(true);
    setTimeout(() => setShake(false), 600);
    setPw('');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-6">
      <button onClick={() => setCurrentView('home')}
        className="absolute top-4 left-4 p-2 text-white/40 hover:text-white transition-colors">
        <ArrowLeft size={20} />
      </button>

      <motion.div animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}
            className="w-20 h-20 bg-gradient-to-br from-red-600 to-red-900 rounded-3xl flex items-center justify-center mb-4 shadow-2xl shadow-red-900/50">
            <Shield size={36} className="text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white font-orbitron">Zone Sécurisée</h1>
          <p className="text-white/40 text-sm mt-1">Administration du système</p>
        </div>

        <div className="glass rounded-2xl p-6 border border-red-500/20 space-y-4">
          <div className="relative">
            <label className="text-white/60 text-xs mb-2 block flex items-center gap-1.5">
              <Lock size={12} /> Mot de passe administrateur
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={e => { setPw(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && tryUnlock()}
                placeholder="Entrez le mot de passe"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white pr-12 focus:outline-none focus:border-red-500/50"
                autoFocus
              />
              <button onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={tryUnlock}
            className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-bold hover:from-red-500 hover:to-red-600 transition-all">
            Accéder au panneau admin
          </motion.button>

          <p className="text-white/20 text-xs text-center">
            Mot de passe par défaut: <span className="text-white/40 font-mono">123</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN ADMIN PANEL
// ══════════════════════════════════════════════════════════════════════════════

export default function AdminPanel() {
  const { adminSettings, updateAdminSettings, setCurrentView, transactions, leaderboard, initGame } = useGameStore();

  // ── Auth state
  const [unlocked, setUnlocked] = useState(false);
  const [currentSubAdmin, setCurrentSubAdmin] = useState<SubAdminData | null>(null);
  const [showAdminSettings, setShowAdminSettings] = useState(false);

  // ── Tabs
  const [activeTab, setActiveTab] = useState<'settings' | 'players' | 'challenges' | 'stats' | 'security' | 'wallet'>('settings');

  // ── Data
  const [allPlayers, setAllPlayers] = useState<PlayerData[]>([]);
  const [allChallenges, setAllChallenges] = useState<ChallengeData[]>([]);
  const [allTransactions, setAllTransactions] = useState<typeof transactions>([]);
  const [loading, setLoading] = useState(false);

  // ── Admin Wallet state
  const [adminWallet, setAdminWallet] = useState<AdminWalletData>(AdminWalletService.getWallet());
  const [adminWalletTxs, setAdminWalletTxs] = useState<AdminWalletTransaction[]>(AdminWalletService.getTransactions());
  const [walletForm, setWalletForm] = useState({ amount: '', currency: 'CDF' as Currency, description: '', mode: 'deposit' as 'deposit' | 'withdraw' });
  const [walletMsg, setWalletMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // ── Settings
  const [settings, setSettings] = useState({ ...adminSettings });
  const [saved, setSaved] = useState(false);

  // ── Password change
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ── Player filter
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'online' | 'offline'>('all');

  // ── Challenge view
  const [viewChallenge, setViewChallenge] = useState<ChallengeData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [players, txs] = await Promise.all([
      AdminService.getAllPlayers(),
      AdminService.getAllTransactions(),
    ]);
    setAllPlayers(players);
    setAllTransactions(txs.map(t => ({
      id: t.id, type: t.type, amount: t.amount, currency: t.currency,
      timestamp: new Date(t.createdAt), description: t.description, status: t.status,
    })));

    // Charger tous les défis (tous joueurs)
    const challengeMap = new Map<string, ChallengeData>();
    for (const p of players) {
      const cs = await ChallengeService.getByPlayer(p.id);
      cs.forEach(c => challengeMap.set(c.id, c));
    }
    setAllChallenges(Array.from(challengeMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (unlocked) loadData();
  }, [unlocked, loadData]);

  useEffect(() => {
    setSettings({ ...adminSettings });
  }, [adminSettings]);

  // ── Permissions helper (null subAdmin = main admin = all permissions)
  const canDo = (perm: keyof SubAdminData['permissions']) => {
    if (!currentSubAdmin) return true; // main admin
    return currentSubAdmin.permissions[perm];
  };

  // ── Guard: show lock screen until authenticated
  if (!unlocked) return (
    <AdminLock onUnlock={(sub) => {
      setUnlocked(true);
      setCurrentSubAdmin(sub || null);
      // Restrict tab based on permissions
      if (sub) {
        if (sub.permissions.canViewStats) setActiveTab('stats');
        else if (sub.permissions.canManagePlayers) setActiveTab('players');
        else if (sub.permissions.canManageChallenges) setActiveTab('challenges');
        else if (sub.permissions.canManageWallet) setActiveTab('wallet');
      }
    }} />
  );

  // ── Save settings
  const save = async () => {
    await updateAdminSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Delete player
  const handleDeletePlayer = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} et toutes ses données? Cette action est irréversible.`)) return;
    await AdminService.deletePlayer(id);
    setAllPlayers(prev => prev.filter(p => p.id !== id));
  };

  // ── Block/Unblock player (store online status as block indicator)
  const handleToggleBlock = async (player: PlayerData) => {
    const updated = { ...player, isOnline: !player.isOnline };
    await AdminService.updatePlayerField(player.id, 'isOnline', updated.isOnline);
    setAllPlayers(prev => prev.map(p => p.id === player.id ? updated : p));
  };

  // ── Change admin password
  const handleChangePassword = () => {
    setPwMsg(null);
    if (pwForm.current !== getAdminPassword()) {
      setPwMsg({ type: 'err', text: 'Mot de passe actuel incorrect' });
      return;
    }
    if (pwForm.next.length < 3) {
      setPwMsg({ type: 'err', text: 'Le nouveau mot de passe doit avoir au moins 3 caractères' });
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: 'err', text: 'Les mots de passe ne correspondent pas' });
      return;
    }
    setAdminPassword(pwForm.next);
    setPwMsg({ type: 'ok', text: 'Mot de passe modifié avec succès!' });
    setPwForm({ current: '', next: '', confirm: '' });
  };

  // ── View match of challenge
  const handleViewMatch = (challenge: ChallengeData) => {
    setViewChallenge(challenge);
  };

  // ── Quick AI game from admin
  const handleQuickAI = () => {
    initGame('ai', { aiDiff: 'moyen' });
  };

  // ── Derived stats
  const totalDeposits = allTransactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
  const totalWins = allTransactions.filter(t => t.type === 'win').reduce((s, t) => s + t.amount, 0);
  const totalFees = Math.round((totalWins * adminSettings.platformFee) / 100);
  const onlinePlayers = allPlayers.filter(p => p.isOnline);
  const pendingChallenges = allChallenges.filter(c => c.status === 'open');
  const activeChallenges = allChallenges.filter(c => c.status === 'accepted');
  const filteredPlayers = allPlayers.filter(p => {
    const matchSearch = playerSearch === '' ||
      `${p.firstName} ${p.lastName} ${p.email} ${p.phone}`.toLowerCase().includes(playerSearch.toLowerCase());
    const matchFilter = playerFilter === 'all' || (playerFilter === 'online' ? p.isOnline : !p.isOnline);
    return matchSearch && matchFilter;
  });

  // Refresh wallet data
  const refreshWallet = () => {
    setAdminWallet(AdminWalletService.getWallet());
    setAdminWalletTxs(AdminWalletService.getTransactions());
  };

  // Admin wallet deposit/withdraw handler
  const handleWalletAction = async () => {
    const amount = parseFloat(walletForm.amount);
    if (!amount || amount <= 0) {
      setWalletMsg({ type: 'err', text: 'Montant invalide' }); return;
    }
    setWalletLoading(true);
    setWalletMsg(null);
    if (walletForm.mode === 'deposit') {
      await AdminWalletService.adminDeposit(amount, walletForm.currency, walletForm.description || 'Dépôt administrateur');
      setWalletMsg({ type: 'ok', text: `Dépôt de ${amount.toLocaleString()} ${walletForm.currency} effectué!` });
    } else {
      const ok = await AdminWalletService.adminWithdraw(amount, walletForm.currency, walletForm.description || 'Retrait administrateur');
      if (!ok) {
        setWalletMsg({ type: 'err', text: `Solde insuffisant en ${walletForm.currency}` });
      } else {
        setWalletMsg({ type: 'ok', text: `Retrait de ${amount.toLocaleString()} ${walletForm.currency} effectué!` });
      }
    }
    setWalletForm(f => ({ ...f, amount: '', description: '' }));
    refreshWallet();
    setWalletLoading(false);
    setTimeout(() => setWalletMsg(null), 3000);
  };

  const tabs = [
    { id: 'settings', icon: '⚙️', label: 'Paramètres', perm: 'canChangeSettings' as keyof SubAdminData['permissions'] | null },
    { id: 'wallet', icon: '💰', label: 'Wallet Admin', perm: 'canManageWallet' as keyof SubAdminData['permissions'] | null },
    { id: 'players', icon: '👥', label: `Joueurs (${allPlayers.length})`, perm: 'canManagePlayers' as keyof SubAdminData['permissions'] | null },
    { id: 'challenges', icon: '⚔️', label: `Défis (${allChallenges.length})`, perm: 'canManageChallenges' as keyof SubAdminData['permissions'] | null },
    { id: 'stats', icon: '📊', label: 'Stats', perm: 'canViewStats' as keyof SubAdminData['permissions'] | null },
    { id: 'security', icon: '🔐', label: 'Sécurité', perm: null },
  ].filter(tab => tab.perm === null ? !currentSubAdmin : canDo(tab.perm)) as { id: string; icon: string; label: string }[];

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-24">

      {/* ── Admin Settings Modal ── */}
      {showAdminSettings && (
        <AdminSettings onClose={() => setShowAdminSettings(false)} />
      )}

      {/* ── Sub-Admin Banner ── */}
      {currentSubAdmin && (
        <div className="bg-purple-900/30 border-b border-purple-500/20 px-4 py-2 flex items-center gap-2">
          <div className="w-6 h-6 bg-purple-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield size={12} className="text-purple-400" />
          </div>
          <p className="text-purple-300 text-xs">
            Connecté en tant que <span className="font-bold">{currentSubAdmin.name}</span>
            <span className="text-purple-400/60 ml-2">({currentSubAdmin.role})</span>
          </p>
          <div className="ml-auto flex gap-1">
            {(Object.entries(currentSubAdmin.permissions) as [string, boolean][])
              .filter(([, v]) => v)
              .map(([k]) => (
                <span key={k} className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">
                  {k.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}
                </span>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Challenge Detail Modal ── */}
      <AnimatePresence>
        {viewChallenge && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setViewChallenge(null)}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              className="glass rounded-2xl p-6 border border-yellow-500/30 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                  <Sword size={20} className="text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Détail du Défi</h3>
                  <p className="text-white/40 text-xs">ID: {viewChallenge.id.slice(0, 8)}...</p>
                </div>
                <div className="ml-auto">
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                    viewChallenge.status === 'open' ? 'bg-yellow-500/20 text-yellow-400' :
                    viewChallenge.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                    viewChallenge.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>
                    {viewChallenge.status === 'open' ? '⏳ Ouvert' :
                     viewChallenge.status === 'accepted' ? '✅ Accepté' :
                     viewChallenge.status === 'cancelled' ? '❌ Annulé' : '⌛ Expiré'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Initiateur', value: viewChallenge.fromPlayerName },
                  { label: 'Mise', value: `${viewChallenge.betAmount.toLocaleString()} ${viewChallenge.currency}` },
                  { label: 'Taille plateau', value: `${viewChallenge.boardSize}×${viewChallenge.boardSize}` },
                  { label: 'Nombre de pions', value: `${viewChallenge.pieceCount} pions/joueur` },
                  { label: 'Temps/tour', value: `${viewChallenge.timePerTurn}s` },
                  { label: 'Créé le', value: new Date(viewChallenge.createdAt).toLocaleString('fr-FR') },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                    <span className="text-white/50 text-xs">{row.label}</span>
                    <span className="text-white text-sm font-medium">{row.value}</span>
                  </div>
                ))}
              </div>

              {viewChallenge.status === 'accepted' && (
                <div className="w-full mt-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm text-center">
                  Partie active liée au défi (ID partie: {viewChallenge.gameId ? `${viewChallenge.gameId.slice(0, 8)}...` : 'indisponible'}).
                </div>
              )}

              <button onClick={() => setViewChallenge(null)}
                className="w-full mt-2 py-2 text-white/40 hover:text-white text-sm transition-colors">
                Fermer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="p-4 bg-gradient-to-b from-red-900/30 to-transparent border-b border-red-500/20 sticky top-0 z-10 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setCurrentView('home')}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/60 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-red-400" />
            <h1 className="text-xl font-bold text-white font-orbitron">Panneau Admin</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={loadData} disabled={loading}
              className="p-2 text-white/40 hover:text-white transition-colors">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleQuickAI}
              className="px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <Play size={12} /> Jouer IA
            </motion.button>
            {/* Bouton Réglages — accès super-admin uniquement */}
            {!currentSubAdmin && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAdminSettings(true)}
                className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-purple-500/30 transition-all"
                title="Réglages avancés — Gestion des administrateurs"
              >
                <Settings size={12} /> Réglages
              </motion.button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Joueurs', value: allPlayers.length, icon: '👥', color: 'text-blue-400' },
            { label: 'En ligne', value: onlinePlayers.length, icon: '🟢', color: 'text-green-400' },
            { label: 'Défis ouverts', value: pendingChallenges.length, icon: '⚔️', color: 'text-yellow-400' },
            { label: 'Actifs', value: activeChallenges.length, icon: '🎮', color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-2 text-center border border-white/5">
              <p className="text-lg mb-0.5">{s.icon}</p>
              <p className={`font-bold text-base ${s.color}`}>{s.value}</p>
              <p className="text-white/30 text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-yellow-500 text-black'
                  : 'text-white/50 hover:text-white'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ════════════════════════════════════════════════════
            TAB: PARAMÈTRES
        ════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <>
            {/* Devises & taux */}
            <div className="glass rounded-2xl p-5 border border-yellow-500/20">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <DollarSign size={16} className="text-yellow-400" />
                Devises & Taux de change
              </h3>

              <div className="mb-5">
                <p className="text-white/60 text-xs mb-2">Devise par défaut</p>
                <div className="flex gap-2">
                  {(['CDF', 'USD'] as Currency[]).map(c => (
                    <button key={c} onClick={() => setSettings({ ...settings, defaultCurrency: c })}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all ${
                        settings.defaultCurrency === c
                          ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                      }`}>
                      {c === 'CDF' ? '🇨🇩 Franc Congolais (CDF)' : '🇺🇸 Dollar US (USD)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/60 text-xs">Taux officiel: 1 USD = ? CDF</label>
                  <span className="text-yellow-400 font-bold text-sm">{settings.cdfRate.toLocaleString()} FC</span>
                </div>
                <input type="number" value={settings.cdfRate}
                  onChange={e => setSettings({ ...settings, cdfRate: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500/50 mb-2" />
                <div className="flex gap-2 flex-wrap">
                  {[2500, 2700, 2800, 2900, 3000, 3100].map(r => (
                    <button key={r} onClick={() => setSettings({ ...settings, cdfRate: r })}
                      className={`px-3 py-1 rounded-lg text-xs transition-all ${
                        settings.cdfRate === r
                          ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/40'
                          : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}>
                      {r.toLocaleString()}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-white/40 text-xs">1 USD →</p>
                    <p className="text-yellow-400 font-bold">{settings.cdfRate.toLocaleString()} FC</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-white/40 text-xs">1 FC →</p>
                    <p className="text-blue-400 font-bold">${(1 / settings.cdfRate).toFixed(5)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Paramètres de jeu */}
            <div className="glass rounded-2xl p-5 border border-white/5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Sliders size={16} className="text-yellow-400" /> Paramètres de jeu
              </h3>
              <div className="space-y-5">
                {/* Temps IA */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white/60 text-xs flex items-center gap-1.5">
                      <Clock size={12} /> Temps vs IA (secondes/tour)
                    </label>
                    <span className="text-yellow-400 font-bold text-sm">{settings.aiMatchTime}s</span>
                  </div>
                  <input type="range" min={10} max={300} value={settings.aiMatchTime}
                    onChange={e => setSettings({ ...settings, aiMatchTime: Number(e.target.value) })}
                    className="w-full accent-yellow-500" />
                  <div className="flex justify-between text-white/20 text-xs mt-1">
                    <span>10s</span><span>2min</span><span>5min</span>
                  </div>
                </div>

                {/* Temps défi */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white/60 text-xs flex items-center gap-1.5">
                      <Clock size={12} /> Temps Défi (secondes/tour)
                    </label>
                    <span className="text-yellow-400 font-bold text-sm">{settings.challengeMatchTime}s</span>
                  </div>
                  <input type="range" min={15} max={600} value={settings.challengeMatchTime}
                    onChange={e => setSettings({ ...settings, challengeMatchTime: Number(e.target.value) })}
                    className="w-full accent-yellow-500" />
                  <div className="flex justify-between text-white/20 text-xs mt-1">
                    <span>15s</span><span>5min</span><span>10min</span>
                  </div>
                </div>

                {/* Commission */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white/60 text-xs flex items-center gap-1.5">
                      <Percent size={12} /> Commission plateforme (%)
                    </label>
                    <span className="text-yellow-400 font-bold text-sm">{settings.platformFee}%</span>
                  </div>
                  <input type="range" min={0} max={10} step={0.5} value={settings.platformFee}
                    onChange={e => setSettings({ ...settings, platformFee: Number(e.target.value) })}
                    className="w-full accent-yellow-500" />
                  <div className="flex justify-between text-white/20 text-xs mt-1">
                    <span>0%</span><span>5%</span><span>10%</span>
                  </div>
                </div>

                {/* Mises min/max */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/60 text-xs mb-2 block">Mise minimale</label>
                    <div className="space-y-1">
                      <input type="number" value={settings.minBet}
                        onChange={e => setSettings({ ...settings, minBet: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500/50" />
                      <p className="text-white/30 text-xs">${(settings.minBet / settings.cdfRate).toFixed(2)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-white/60 text-xs mb-2 block">Mise maximale</label>
                    <div className="space-y-1">
                      <input type="number" value={settings.maxBet}
                        onChange={e => setSettings({ ...settings, maxBet: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500/50" />
                      <p className="text-white/30 text-xs">${(settings.maxBet / settings.cdfRate).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <motion.button whileTap={{ scale: 0.97 }} onClick={save}
                className={`w-full mt-5 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  saved
                    ? 'bg-green-500 text-white'
                    : 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black'
                }`}>
                {saved ? <><CheckCircle size={16} /> Sauvegardé!</> : <><Save size={16} /> Sauvegarder</>}
              </motion.button>
            </div>

            {/* Règles actives */}
            <div className="glass rounded-2xl p-5 border border-red-500/20">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Settings size={16} className="text-red-400" /> Règles africaines actives
              </h3>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  'Captures en arrière autorisées (toutes pièces)',
                  'Dame = couloir diagonal illimité (flying king)',
                  'Dame capture sur tout le couloir diagonal',
                  'Pions bloqués = défaite automatique',
                  '3 nuls → 4e match décisif (plus de pions gagne)',
                  `Commission: ${adminSettings.platformFee}% par joueur sur gains`,
                  'Promotion dame à la dernière rangée',
                  'Captures multiples en chaîne obligatoires',
                  'IA 5 niveaux: Simple/Facile/Normal/Difficile/Extrême',
                  `Taux: 1 USD = ${adminSettings.cdfRate.toLocaleString()} CDF`,
                  'Historique match IA supprimé immédiatement',
                  'Historique match en ligne supprimé après fin',
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white/3 rounded-lg px-3 py-2">
                    <CheckCircle size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-white/60 text-xs">{rule}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: JOUEURS
        ════════════════════════════════════════════════════ */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            {/* Compteurs rapides */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass rounded-xl p-3 text-center border border-white/5">
                <p className="text-2xl font-bold text-white">{allPlayers.length}</p>
                <p className="text-white/40 text-xs">Total</p>
              </div>
              <div className="glass rounded-xl p-3 text-center border border-green-500/20">
                <p className="text-2xl font-bold text-green-400">{onlinePlayers.length}</p>
                <p className="text-white/40 text-xs flex items-center justify-center gap-1">
                  <Wifi size={10} /> En ligne
                </p>
              </div>
              <div className="glass rounded-xl p-3 text-center border border-red-500/20">
                <p className="text-2xl font-bold text-red-400">{allPlayers.length - onlinePlayers.length}</p>
                <p className="text-white/40 text-xs flex items-center justify-center gap-1">
                  <WifiOff size={10} /> Hors ligne
                </p>
              </div>
            </div>

            {/* Filtres */}
            <div className="glass rounded-xl p-3 border border-white/5 space-y-3">
              <input
                type="text"
                placeholder="🔍 Rechercher un joueur..."
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-500/50"
              />
              <div className="flex gap-2">
                {(['all', 'online', 'offline'] as const).map(f => (
                  <button key={f} onClick={() => setPlayerFilter(f)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      playerFilter === f
                        ? 'bg-yellow-500 text-black'
                        : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}>
                    {f === 'all' ? 'Tous' : f === 'online' ? '🟢 En ligne' : '⚫ Hors ligne'}
                  </button>
                ))}
              </div>
            </div>

            {/* Liste joueurs */}
            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Users size={16} className="text-blue-400" />
                  Joueurs ({filteredPlayers.length})
                </h3>
                <span className="text-white/30 text-xs">Appuyer sur la corbeille pour supprimer</span>
              </div>

              <div className="divide-y divide-white/5 max-h-[50vh] overflow-y-auto">
                {filteredPlayers.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-white/30 text-sm">Aucun joueur trouvé</p>
                  </div>
                )}
                {filteredPlayers.map((player: PlayerData) => (
                  <motion.div key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">

                    {/* Avatar + statut en ligne */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">
                        {player.avatar}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${
                        player.isOnline ? 'bg-green-400' : 'bg-gray-600'
                      }`} />
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-white text-sm font-medium truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        {player.role === 'admin' && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-md font-bold flex-shrink-0">
                            ADMIN
                          </span>
                        )}
                      </div>
                      <p className="text-white/30 text-[11px] truncate">{player.email}</p>
                      <p className="text-white/20 text-[11px]">{player.phone}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-yellow-400 text-xs font-bold">{player.balance.toLocaleString()} FC</span>
                        <span className="text-white/20 text-[10px]">≈${(player.balance / adminSettings.cdfRate).toFixed(1)}</span>
                        <span className="text-green-400 text-xs">{player.totalWins}V</span>
                        <span className="text-red-400 text-xs">{player.totalLosses}D</span>
                      </div>
                    </div>

                    {/* Actions */}
                    {player.role !== 'admin' && (
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleBlock(player)}
                          title={player.isOnline ? 'Mettre hors ligne' : 'Mettre en ligne'}
                          className={`p-1.5 rounded-lg transition-all ${
                            player.isOnline
                              ? 'text-green-400/60 hover:text-green-400 hover:bg-green-400/10'
                              : 'text-gray-500 hover:text-gray-400 hover:bg-white/10'
                          }`}>
                          {player.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                        </button>
                        <button
                          onClick={() => handleDeletePlayer(player.id, `${player.firstName} ${player.lastName}`)}
                          className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Bouton supprimer tous les hors-ligne */}
            <button
              onClick={async () => {
                const offline = allPlayers.filter(p => !p.isOnline && p.role !== 'admin');
                if (offline.length === 0) return;
                if (!confirm(`Supprimer ${offline.length} joueur(s) hors ligne?`)) return;
                for (const p of offline) await AdminService.deletePlayer(p.id);
                setAllPlayers(prev => prev.filter(p => p.isOnline || p.role === 'admin'));
              }}
              className="w-full py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all">
              <UserX size={16} /> Supprimer tous les joueurs hors ligne
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: DÉFIS
        ════════════════════════════════════════════════════ */}
        {activeTab === 'challenges' && (
          <div className="space-y-4">
            {/* Résumé */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Ouverts', value: pendingChallenges.length, color: 'text-yellow-400', bg: 'border-yellow-500/20', icon: <AlertCircle size={16} className="text-yellow-400" /> },
                { label: 'En cours', value: activeChallenges.length, color: 'text-green-400', bg: 'border-green-500/20', icon: <Activity size={16} className="text-green-400" /> },
                { label: 'Total', value: allChallenges.length, color: 'text-blue-400', bg: 'border-blue-500/20', icon: <Sword size={16} className="text-blue-400" /> },
              ].map(s => (
                <div key={s.label} className={`glass rounded-xl p-3 text-center border ${s.bg}`}>
                  <div className="flex justify-center mb-1">{s.icon}</div>
                  <p className={`font-bold text-xl ${s.color}`}>{s.value}</p>
                  <p className="text-white/40 text-xs">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Filtres par statut */}
            {(['open', 'accepted', 'cancelled', 'expired'] as const).map(status => {
              const filtered = allChallenges.filter(c => c.status === status);
              if (filtered.length === 0) return null;
              const statusInfo = {
                open: { label: '⏳ Ouverts', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                accepted: { label: '✅ En cours / Acceptés', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
                cancelled: { label: '❌ Annulés', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
                expired: { label: '⌛ Expirés', color: 'text-gray-300', bg: 'bg-gray-500/10 border-gray-500/20' },
              }[status];

              return (
                <div key={status} className="glass rounded-2xl border border-white/5 overflow-hidden">
                  <div className={`px-4 py-3 border-b border-white/5 ${statusInfo.bg} flex items-center justify-between`}>
                    <h4 className={`font-semibold text-sm ${statusInfo.color}`}>{statusInfo.label}</h4>
                    <span className={`text-xs font-bold ${statusInfo.color}`}>{filtered.length}</span>
                  </div>
                  <div className="divide-y divide-white/5 max-h-60 overflow-y-auto">
                    {filtered.map(c => {
                      const challenger = allPlayers.find(p => p.id === c.fromPlayerId);
                      const challenged = allPlayers.find(p => p.id === c.toPlayerId);
                      return (
                        <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm">{challenger?.avatar || '👤'}</span>
                              <p className="text-white text-xs font-medium truncate">
                                {c.fromPlayerName}
                              </p>
                              <ChevronRight size={12} className="text-white/30 flex-shrink-0" />
                              <p className="text-white/60 text-xs truncate">
                                {challenged ? `${challenged.firstName} ${challenged.lastName}` : 'Inconnu'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-yellow-400 text-xs font-bold">
                                {c.betAmount.toLocaleString()} {c.currency}
                              </span>
                              <span className="text-white/30 text-xs">{c.boardSize}×{c.boardSize}</span>
                              <span className="text-white/30 text-xs">{c.pieceCount} pions</span>
                              <span className="text-white/30 text-xs">{c.timePerTurn}s/tour</span>
                            </div>
                            <p className="text-white/20 text-[10px] mt-0.5">
                              {new Date(c.createdAt).toLocaleString('fr-FR')}
                            </p>
                          </div>
                          <button
                            onClick={() => handleViewMatch(c)}
                            className="flex-shrink-0 px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-blue-500/30 transition-all">
                            <Eye size={12} /> Voir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {allChallenges.length === 0 && (
              <div className="glass rounded-2xl p-10 text-center border border-white/5">
                <Sword size={32} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">Aucun défi enregistré</p>
                <p className="text-white/20 text-xs mt-1">Les défis apparaîtront ici</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: STATISTIQUES
        ════════════════════════════════════════════════════ */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total joueurs', value: allPlayers.length, color: 'text-blue-400', icon: '👥' },
                { label: 'Joueurs en ligne', value: leaderboard.filter(p => p.isOnline).length, color: 'text-green-400', icon: '🟢' },
                { label: 'Total transactions', value: allTransactions.length, color: 'text-purple-400', icon: '💳' },
                { label: 'Matchs joués', value: allTransactions.filter(t => t.type === 'win' || t.type === 'loss').length, color: 'text-orange-400', icon: '🎮' },
                { label: 'Dépôts (FC)', value: `${(totalDeposits / 1000).toFixed(0)}K`, color: 'text-cyan-400', icon: '💰' },
                { label: 'Revenus frais (FC)', value: `${(totalFees / 1000).toFixed(0)}K`, color: 'text-yellow-400', icon: '📈' },
                { label: 'Défis ouverts', value: pendingChallenges.length, color: 'text-red-400', icon: '⚔️' },
                { label: 'Défis actifs', value: activeChallenges.length, color: 'text-teal-400', icon: '⚡' },
              ].map(s => (
                <div key={s.label} className="glass rounded-xl p-4 border border-white/5 flex items-center gap-3">
                  <span className="text-2xl">{s.icon}</span>
                  <div>
                    <p className={`font-bold text-xl ${s.color}`}>{s.value}</p>
                    <p className="text-white/40 text-xs">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Top joueurs par gains */}
            <div className="glass rounded-2xl p-5 border border-white/5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-yellow-400" /> Top 10 Joueurs par gains
              </h3>
              <div className="space-y-2">
                {[...allPlayers]
                  .sort((a, b) => b.totalEarnings - a.totalEarnings)
                  .slice(0, 10)
                  .map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                      <span className={`text-sm font-bold w-6 text-center ${
                        i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-white/30'
                      }`}>
                        #{i + 1}
                      </span>
                      <span className="text-lg">{p.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{p.firstName} {p.lastName}</p>
                        <p className="text-white/30 text-xs">{p.totalWins}V / {p.totalLosses}D</p>
                      </div>
                      <div className="text-right">
                        <p className="text-yellow-400 text-sm font-bold">
                          {(p.totalEarnings / 1000).toFixed(0)}K FC
                        </p>
                        <p className="text-white/30 text-xs">
                          ${(p.totalEarnings / adminSettings.cdfRate).toFixed(0)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Transactions récentes */}
            <div className="glass rounded-2xl p-5 border border-white/5">
              <h3 className="text-white font-semibold mb-4">📋 Transactions récentes</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allTransactions.slice(0, 20).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {tx.type === 'deposit' ? '💳' : tx.type === 'win' ? '🏆' :
                         tx.type === 'loss' ? '😢' : tx.type === 'withdraw' ? '💸' : '💰'}
                      </span>
                      <div>
                        <p className="text-white text-xs">{tx.description}</p>
                        <p className="text-white/30 text-xs">
                          {new Date(tx.timestamp).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} {tx.currency}
                    </span>
                  </div>
                ))}
                {allTransactions.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-6">Aucune transaction</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: WALLET ADMIN
        ════════════════════════════════════════════════════ */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">

            {/* Refresh Button */}
            <button onClick={refreshWallet}
              className="w-full py-2 bg-white/5 border border-white/10 text-white/50 rounded-xl text-xs flex items-center justify-center gap-2 hover:bg-white/10 transition-all">
              <RefreshCw size={12} /> Actualiser le wallet
            </button>

            {/* Soldes */}
            <div className="grid grid-cols-2 gap-3">
              <motion.div whileHover={{ scale: 1.02 }}
                className="glass rounded-2xl p-5 border border-yellow-500/30 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent pointer-events-none" />
                <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-xl">🇨🇩</span>
                </div>
                <p className="text-white/50 text-xs mb-1">Solde CDF</p>
                <p className="text-yellow-400 font-bold text-2xl">
                  {adminWallet.balanceCDF.toLocaleString()}
                </p>
                <p className="text-yellow-400/60 text-xs">FC</p>
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-white/30 text-[10px]">Total collecté</p>
                  <p className="text-yellow-400/70 text-sm font-semibold">
                    {adminWallet.totalFeesCollectedCDF.toLocaleString()} FC
                  </p>
                </div>
              </motion.div>

              <motion.div whileHover={{ scale: 1.02 }}
                className="glass rounded-2xl p-5 border border-green-500/30 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent pointer-events-none" />
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-xl">🇺🇸</span>
                </div>
                <p className="text-white/50 text-xs mb-1">Solde USD</p>
                <p className="text-green-400 font-bold text-2xl">
                  ${adminWallet.balanceUSD.toLocaleString()}
                </p>
                <p className="text-green-400/60 text-xs">Dollar US</p>
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-white/30 text-[10px]">Total collecté</p>
                  <p className="text-green-400/70 text-sm font-semibold">
                    ${adminWallet.totalFeesCollectedUSD.toLocaleString()}
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Equivalent total */}
            <div className="glass rounded-xl p-4 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <TrendingUp size={16} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs">Valeur totale équivalente</p>
                  <p className="text-white/30 text-[10px]">CDF + USD converti au taux actuel</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-purple-400 font-bold">
                  {(adminWallet.balanceCDF + adminWallet.balanceUSD * adminSettings.cdfRate).toLocaleString()} FC
                </p>
                <p className="text-purple-400/60 text-xs">
                  ≈ ${((adminWallet.balanceCDF / adminSettings.cdfRate) + adminWallet.balanceUSD).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Commission info */}
            <div className="glass rounded-xl p-4 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Percent size={14} className="text-blue-400" />
                <p className="text-white font-semibold text-sm">Commission automatique</p>
                <span className="ml-auto bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-lg font-bold">
                  {adminSettings.platformFee}% par joueur
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-xs mb-1">Collecte par match</p>
                  <p className="text-blue-400 font-bold text-sm">
                    {adminSettings.platformFee * 2}% total
                  </p>
                  <p className="text-white/20 text-[10px]">(2 × {adminSettings.platformFee}%)</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-white/40 text-xs mb-1">Transactions collectées</p>
                  <p className="text-blue-400 font-bold text-sm">
                    {adminWalletTxs.filter(t => t.type === 'fee_in').length}
                  </p>
                  <p className="text-white/20 text-[10px]">matchs traités</p>
                </div>
              </div>
              <p className="text-white/20 text-[10px] mt-3 text-center">
                💡 La commission est automatiquement transférée à la fin de chaque match payant
              </p>
            </div>

            {/* Dépôt / Retrait admin */}
            <div className="glass rounded-2xl p-5 border border-white/10">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <DollarSign size={16} className="text-yellow-400" />
                Dépôt / Retrait Administrateur
              </h3>

              {/* Mode selector */}
              <div className="flex gap-2 mb-4 p-1 bg-white/5 rounded-xl">
                <button
                  onClick={() => setWalletForm(f => ({ ...f, mode: 'deposit' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    walletForm.mode === 'deposit'
                      ? 'bg-green-500 text-white'
                      : 'text-white/40 hover:text-white'
                  }`}>
                  <PlusCircle size={14} /> Dépôt
                </button>
                <button
                  onClick={() => setWalletForm(f => ({ ...f, mode: 'withdraw' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    walletForm.mode === 'withdraw'
                      ? 'bg-red-500 text-white'
                      : 'text-white/40 hover:text-white'
                  }`}>
                  <MinusCircle size={14} /> Retrait
                </button>
              </div>

              {/* Devise */}
              <div className="mb-4">
                <label className="text-white/50 text-xs mb-2 block">Devise</label>
                <div className="flex gap-2">
                  {(['CDF', 'USD'] as Currency[]).map(c => (
                    <button key={c}
                      onClick={() => setWalletForm(f => ({ ...f, currency: c }))}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all ${
                        walletForm.currency === c
                          ? c === 'CDF'
                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                            : 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}>
                      {c === 'CDF' ? '🇨🇩 CDF' : '🇺🇸 USD'}
                    </button>
                  ))}
                </div>
                {/* Solde disponible */}
                <p className="text-white/30 text-xs mt-2 text-right">
                  Solde {walletForm.currency}: {' '}
                  <span className="font-semibold text-yellow-400">
                    {walletForm.currency === 'CDF'
                      ? adminWallet.balanceCDF.toLocaleString() + ' FC'
                      : '$' + adminWallet.balanceUSD.toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Montant */}
              <div className="mb-4">
                <label className="text-white/50 text-xs mb-2 block">Montant</label>
                <input
                  type="number"
                  value={walletForm.amount}
                  onChange={e => setWalletForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={walletForm.currency === 'CDF' ? 'ex: 50000' : 'ex: 20'}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50"
                />
                {walletForm.amount && parseFloat(walletForm.amount) > 0 && (
                  <p className="text-white/30 text-xs mt-1.5 text-right">
                    ≈ {walletForm.currency === 'CDF'
                      ? '$' + (parseFloat(walletForm.amount) / adminSettings.cdfRate).toFixed(2)
                      : (parseFloat(walletForm.amount) * adminSettings.cdfRate).toLocaleString() + ' FC'
                    }
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="text-white/50 text-xs mb-2 block">Description (optionnel)</label>
                <input
                  type="text"
                  value={walletForm.description}
                  onChange={e => setWalletForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: Retrait vers compte bancaire..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-yellow-500/50"
                />
              </div>

              {/* Message de retour */}
              <AnimatePresence>
                {walletMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mb-3 rounded-xl px-4 py-3 flex items-center gap-2 ${
                      walletMsg.type === 'ok'
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                        : 'bg-red-500/20 border border-red-500/30 text-red-400'
                    }`}>
                    {walletMsg.type === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    <span className="text-sm">{walletMsg.text}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bouton action */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={walletLoading}
                onClick={handleWalletAction}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  walletLoading ? 'opacity-50 cursor-not-allowed bg-white/10 text-white' :
                  walletForm.mode === 'deposit'
                    ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-500 hover:to-green-600'
                    : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600'
                }`}>
                {walletLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : walletForm.mode === 'deposit' ? (
                  <><ArrowDownCircle size={16} /> Effectuer le dépôt</>
                ) : (
                  <><ArrowUpCircle size={16} /> Effectuer le retrait</>
                )}
              </motion.button>
            </div>

            {/* Historique des transactions wallet admin */}
            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <History size={16} className="text-blue-400" />
                  Historique du Wallet
                </h3>
                <span className="text-white/30 text-xs">{adminWalletTxs.length} opérations</span>
              </div>

              <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                {adminWalletTxs.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-4xl mb-3">💰</p>
                    <p className="text-white/40 text-sm">Aucune transaction pour l'instant</p>
                    <p className="text-white/20 text-xs mt-1">
                      Les commissions collectées apparaîtront ici automatiquement
                    </p>
                  </div>
                )}
                {adminWalletTxs.map((tx) => {
                  const isFee = tx.type === 'fee_in';
                  const isDeposit = tx.type === 'deposit';
                  const isPositive = tx.amount >= 0;
                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isFee ? 'bg-blue-500/20' :
                        isDeposit ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        <span className="text-base">
                          {isFee ? '💹' : isDeposit ? '⬇️' : '⬆️'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            isFee ? 'bg-blue-500/20 text-blue-400' :
                            isDeposit ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {isFee ? 'COMMISSION' : isDeposit ? 'DÉPÔT' : 'RETRAIT'}
                          </span>
                          <span className="text-white/20 text-[10px]">
                            {new Date(tx.createdAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : ''}{tx.amount.toLocaleString()} {tx.currency}
                        </p>
                        {tx.currency === 'CDF' && (
                          <p className="text-white/20 text-[10px]">
                            ≈${(Math.abs(tx.amount) / adminSettings.cdfRate).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB: SÉCURITÉ (Mot de passe admin)
        ════════════════════════════════════════════════════ */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            {/* Change password */}
            <div className="glass rounded-2xl p-5 border border-red-500/20">
              <h3 className="text-white font-semibold mb-5 flex items-center gap-2">
                <Key size={16} className="text-red-400" /> Modifier le mot de passe admin
              </h3>

              <div className="space-y-4">
                {/* Mot de passe actuel */}
                <div>
                  <label className="text-white/60 text-xs mb-2 block">Mot de passe actuel</label>
                  <div className="relative">
                    <input
                      type={pwShow.current ? 'text' : 'password'}
                      value={pwForm.current}
                      onChange={e => { setPwForm(f => ({ ...f, current: e.target.value })); setPwMsg(null); }}
                      placeholder="Mot de passe actuel"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white pr-12 focus:outline-none focus:border-red-500/50"
                    />
                    <button onClick={() => setPwShow(s => ({ ...s, current: !s.current }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                      {pwShow.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Nouveau mot de passe */}
                <div>
                  <label className="text-white/60 text-xs mb-2 block">Nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={pwShow.next ? 'text' : 'password'}
                      value={pwForm.next}
                      onChange={e => { setPwForm(f => ({ ...f, next: e.target.value })); setPwMsg(null); }}
                      placeholder="Nouveau mot de passe (min. 3 caractères)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white pr-12 focus:outline-none focus:border-red-500/50"
                    />
                    <button onClick={() => setPwShow(s => ({ ...s, next: !s.next }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                      {pwShow.next ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Force indicator */}
                  {pwForm.next && (
                    <div className="mt-2 flex gap-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                          pwForm.next.length >= i * 2
                            ? i <= 1 ? 'bg-red-500' : i <= 2 ? 'bg-orange-500' : i <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                            : 'bg-white/10'
                        }`} />
                      ))}
                      <span className="text-xs text-white/30 ml-2">
                        {pwForm.next.length < 3 ? 'Faible' : pwForm.next.length < 6 ? 'Moyen' : pwForm.next.length < 8 ? 'Fort' : 'Très fort'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirmation */}
                <div>
                  <label className="text-white/60 text-xs mb-2 block">Confirmer le nouveau mot de passe</label>
                  <div className="relative">
                    <input
                      type={pwShow.confirm ? 'text' : 'password'}
                      value={pwForm.confirm}
                      onChange={e => { setPwForm(f => ({ ...f, confirm: e.target.value })); setPwMsg(null); }}
                      placeholder="Confirmer le nouveau mot de passe"
                      className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white pr-12 focus:outline-none ${
                        pwForm.confirm && pwForm.next !== pwForm.confirm
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-white/10 focus:border-red-500/50'
                      }`}
                    />
                    <button onClick={() => setPwShow(s => ({ ...s, confirm: !s.confirm }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                      {pwShow.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                    <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                      <XCircle size={12} /> Les mots de passe ne correspondent pas
                    </p>
                  )}
                </div>

                {/* Message de retour */}
                <AnimatePresence>
                  {pwMsg && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`rounded-xl px-4 py-3 flex items-center gap-2 ${
                        pwMsg.type === 'ok'
                          ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                          : 'bg-red-500/20 border border-red-500/30 text-red-400'
                      }`}>
                      {pwMsg.type === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                      <span className="text-sm">{pwMsg.text}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button whileTap={{ scale: 0.97 }} onClick={handleChangePassword}
                  className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:from-red-500 hover:to-red-600 transition-all">
                  <Key size={16} /> Changer le mot de passe
                </motion.button>
              </div>
            </div>

            {/* Info sécurité */}
            <div className="glass rounded-2xl p-5 border border-white/5">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Shield size={16} className="text-blue-400" /> Informations de sécurité
              </h3>
              <div className="space-y-3">
                {[
                  { icon: '🔐', label: 'Accès admin', value: '5 clics sur le logo' },
                  { icon: '🔑', label: 'Mot de passe par défaut', value: '123' },
                  { icon: '🛡️', label: 'Niveau de sécurité', value: 'Modéré (local)' },
                  { icon: '⏱️', label: 'Session admin', value: 'Expire à la fermeture' },
                  { icon: '💾', label: 'Stockage', value: 'localStorage + Supabase (si configuré)' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span>{item.icon}</span>
                      <span className="text-white/60 text-xs">{item.label}</span>
                    </div>
                    <span className="text-white text-xs font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Zone danger */}
            <div className="glass rounded-2xl p-5 border border-red-500/20">
              <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <AlertCircle size={16} /> Zone dangereuse
              </h3>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    if (!confirm('Réinitialiser TOUS les joueurs non-admin? Cette action est irréversible!')) return;
                    const toDelete = allPlayers.filter(p => p.role !== 'admin');
                    for (const p of toDelete) await AdminService.deletePlayer(p.id);
                    setAllPlayers(prev => prev.filter(p => p.role === 'admin'));
                  }}
                  className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all">
                  <Trash2 size={16} /> Supprimer tous les comptes joueurs
                </button>

                <button
                  onClick={() => {
                    if (!confirm('Réinitialiser le mot de passe admin à "123"?')) return;
                    setAdminPassword(ADMIN_DEFAULT_PASSWORD);
                    setPwMsg({ type: 'ok', text: 'Mot de passe réinitialisé à "123"' });
                    setActiveTab('security');
                  }}
                  className="w-full py-3 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-orange-500/20 transition-all">
                  <RefreshCw size={16} /> Réinitialiser mot de passe admin
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
