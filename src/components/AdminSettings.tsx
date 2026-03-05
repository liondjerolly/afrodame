/**
 * ADMIN SETTINGS — Gestion des sous-administrateurs
 * Accessible via le bouton ⚙️ Réglages dans l'admin
 * Protégé par un mot de passe super-admin (défaut: 1234)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, Lock, Eye, EyeOff, Plus, Trash2, Edit3,
  CheckCircle, XCircle, Key, UserCog, RefreshCw,
  AlertCircle, Save, Users, ChevronDown, ChevronUp,
  Activity, Wallet, Settings, BarChart2, Sword,
} from 'lucide-react';
import { SubAdminService, type SubAdminData } from '../lib/database';

interface Props {
  onClose: () => void;
}

const ROLES = [
  { id: 'super', label: 'Super Admin', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', icon: '👑' },
  { id: 'moderator', label: 'Modérateur', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30', icon: '🛡️' },
  { id: 'support', label: 'Support', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30', icon: '💬' },
] as const;

const PERMISSIONS = [
  { key: 'canManagePlayers', label: 'Gérer les joueurs', icon: <Users size={14} /> },
  { key: 'canManageWallet', label: 'Gérer le wallet', icon: <Wallet size={14} /> },
  { key: 'canViewStats', label: 'Voir les statistiques', icon: <BarChart2 size={14} /> },
  { key: 'canManageChallenges', label: 'Gérer les défis', icon: <Sword size={14} /> },
  { key: 'canChangeSettings', label: 'Modifier les paramètres', icon: <Settings size={14} /> },
] as const;

type PermKey = typeof PERMISSIONS[number]['key'];

// ── Lock screen pour accéder aux réglages ────────────────────────────────────
function SuperAdminLock({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);

  const tryUnlock = () => {
    if (SubAdminService.verifySuperAdminPassword(pw)) {
      onUnlock();
    } else {
      setErr('Mot de passe super-admin incorrect');
      setShake(true);
      setTimeout(() => setShake(false), 600);
      setPw('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
      <motion.div
        animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xs"
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-900 rounded-2xl flex items-center justify-center mb-4 shadow-2xl shadow-purple-900/50"
          >
            <Shield size={28} className="text-white" />
          </motion.div>
          <h2 className="text-xl font-bold text-white font-orbitron">Accès Super Admin</h2>
          <p className="text-white/40 text-sm mt-1 text-center">Gestion des administrateurs</p>
          <div className="mt-2 px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded-lg">
            <p className="text-purple-400 text-xs font-mono">Mot de passe par défaut: 1234</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 border border-purple-500/20 space-y-4">
          <div className="relative">
            <label className="text-white/60 text-xs mb-2 block flex items-center gap-1.5">
              <Lock size={12} /> Mot de passe super-administrateur
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={e => { setPw(e.target.value); setErr(''); }}
                onKeyDown={e => e.key === 'Enter' && tryUnlock()}
                placeholder="Mot de passe super-admin"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white pr-12 focus:outline-none focus:border-purple-500/50"
                autoFocus
              />
              <button
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {err && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-xs mt-2 flex items-center gap-1"
              >
                <XCircle size={12} /> {err}
              </motion.p>
            )}
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={tryUnlock}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-bold hover:from-purple-500 hover:to-purple-600 transition-all flex items-center justify-center gap-2"
          >
            <Shield size={16} /> Accéder aux réglages
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Formulaire de création/modification d'un sous-admin ──────────────────────
function SubAdminForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SubAdminData;
  onSave: (data: Omit<SubAdminData, 'id' | 'createdAt' | 'lastLogin'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    password: initial?.password || '',
    role: (initial?.role || 'support') as SubAdminData['role'],
    isActive: initial?.isActive ?? true,
    permissions: initial?.permissions || {
      canManagePlayers: false,
      canManageWallet: false,
      canViewStats: true,
      canManageChallenges: false,
      canChangeSettings: false,
    },
  });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setRoleDefaults = (role: SubAdminData['role']) => {
    const perms = {
      super: { canManagePlayers: true, canManageWallet: true, canViewStats: true, canManageChallenges: true, canChangeSettings: true },
      moderator: { canManagePlayers: true, canManageWallet: false, canViewStats: true, canManageChallenges: true, canChangeSettings: false },
      support: { canManagePlayers: false, canManageWallet: false, canViewStats: true, canManageChallenges: false, canChangeSettings: false },
    };
    setForm(f => ({ ...f, role, permissions: perms[role] }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Nom requis';
    if (!form.email.trim() || !form.email.includes('@')) errs.email = 'Email invalide';
    if (!form.password || form.password.length < 3) errs.password = 'Mot de passe min. 3 caractères';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 border border-purple-500/20 space-y-4"
    >
      <h3 className="text-white font-bold flex items-center gap-2">
        <UserCog size={16} className="text-purple-400" />
        {initial ? 'Modifier un administrateur' : 'Nouvel administrateur'}
      </h3>

      {/* Nom */}
      <div>
        <label className="text-white/60 text-xs mb-1.5 block">Nom complet *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Ex: Jean-Pierre Mukendi"
          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500/50 ${
            errors.name ? 'border-red-500/50' : 'border-white/10'
          }`}
        />
        {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="text-white/60 text-xs mb-1.5 block">Email *</label>
        <input
          type="email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="admin@exemple.com"
          className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500/50 ${
            errors.email ? 'border-red-500/50' : 'border-white/10'
          }`}
        />
        {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
      </div>

      {/* Mot de passe */}
      <div>
        <label className="text-white/60 text-xs mb-1.5 block">Mot de passe d'accès *</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Mot de passe pour accéder à l'admin"
            className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-white text-sm pr-12 focus:outline-none focus:border-purple-500/50 ${
              errors.password ? 'border-red-500/50' : 'border-white/10'
            }`}
          />
          <button
            onClick={() => setShowPw(!showPw)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
        {form.password && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    form.password.length >= i * 2
                      ? i <= 1 ? 'bg-red-500' : i <= 2 ? 'bg-orange-500' : i <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                      : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-white/30">
              {form.password.length < 3 ? 'Faible' : form.password.length < 6 ? 'Moyen' : 'Fort'}
            </span>
          </div>
        )}
      </div>

      {/* Rôle */}
      <div>
        <label className="text-white/60 text-xs mb-2 block">Rôle</label>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map(role => (
            <button
              key={role.id}
              onClick={() => setRoleDefaults(role.id)}
              className={`py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                form.role === role.id
                  ? role.bg + ' ' + role.color
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
              }`}
            >
              <span>{role.icon}</span>
              <span>{role.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div>
        <label className="text-white/60 text-xs mb-2 block flex items-center gap-1.5">
          <Shield size={12} /> Permissions
        </label>
        <div className="space-y-2">
          {PERMISSIONS.map(perm => (
            <label
              key={perm.key}
              className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-white/8 transition-colors"
            >
              <div
                className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                  form.permissions[perm.key as PermKey]
                    ? 'bg-purple-500 border-purple-500'
                    : 'bg-transparent border-white/20'
                }`}
                onClick={() => setForm(f => ({
                  ...f,
                  permissions: { ...f.permissions, [perm.key]: !f.permissions[perm.key as PermKey] },
                }))}
              >
                {form.permissions[perm.key as PermKey] && (
                  <CheckCircle size={12} className="text-white" />
                )}
              </div>
              <span className="text-white/60 text-sm flex items-center gap-2">
                {perm.icon} {perm.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Statut actif */}
      <label className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-3 cursor-pointer">
        <div
          className={`w-11 h-6 rounded-full transition-all flex-shrink-0 ${form.isActive ? 'bg-green-500' : 'bg-white/20'}`}
          onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
        >
          <div className={`w-5 h-5 bg-white rounded-full m-0.5 transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
        </div>
        <div>
          <p className="text-white text-sm font-medium">Compte actif</p>
          <p className="text-white/30 text-xs">{form.isActive ? 'Peut accéder au panneau admin' : 'Accès bloqué'}</p>
        </div>
      </label>

      {/* Boutons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-white/5 border border-white/10 text-white/60 rounded-xl text-sm font-semibold hover:bg-white/10 transition-all"
        >
          Annuler
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:from-purple-500 hover:to-purple-600 transition-all"
        >
          <Save size={14} /> {initial ? 'Modifier' : 'Créer'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Main AdminSettings Component ─────────────────────────────────────────────
export default function AdminSettings({ onClose }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [subAdmins, setSubAdmins] = useState<SubAdminData[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<SubAdminData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Super admin password change
  const [superPwForm, setSuperPwForm] = useState({ current: '', next: '', confirm: '' });
  const [superPwShow, setSuperPwShow] = useState({ current: false, next: false, confirm: false });
  const [superPwMsg, setSuperPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showSuperPwSection, setShowSuperPwSection] = useState(false);

  useEffect(() => {
    if (unlocked) {
      setSubAdmins(SubAdminService.getAll());
    }
  }, [unlocked]);

  const refresh = () => setSubAdmins(SubAdminService.getAll());

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleCreate = (data: Omit<SubAdminData, 'id' | 'createdAt' | 'lastLogin'>) => {
    // Vérifier si l'email est déjà utilisé
    const existing = subAdmins.find(a => a.email === data.email);
    if (existing) {
      showMsg('err', 'Cet email est déjà utilisé par un autre administrateur');
      return;
    }
    // Vérifier si le mot de passe entre en conflit
    const mainPw = localStorage.getItem('dames_admin_password') || '123';
    if (data.password === mainPw) {
      showMsg('err', 'Le mot de passe ne peut pas être identique au mot de passe principal');
      return;
    }
    const dup = subAdmins.find(a => a.password === data.password);
    if (dup) {
      showMsg('err', `Ce mot de passe est déjà utilisé par "${dup.name}"`);
      return;
    }
    SubAdminService.create(data);
    refresh();
    setShowForm(false);
    showMsg('ok', `Administrateur "${data.name}" créé avec succès!`);
  };

  const handleEdit = (data: Omit<SubAdminData, 'id' | 'createdAt' | 'lastLogin'>) => {
    if (!editTarget) return;
    // Vérifier duplicates (sauf l'admin en cours d'édition)
    const emailDup = subAdmins.find(a => a.email === data.email && a.id !== editTarget.id);
    if (emailDup) {
      showMsg('err', 'Cet email est déjà utilisé');
      return;
    }
    const pwDup = subAdmins.find(a => a.password === data.password && a.id !== editTarget.id);
    if (pwDup) {
      showMsg('err', `Ce mot de passe est déjà utilisé par "${pwDup.name}"`);
      return;
    }
    SubAdminService.update(editTarget.id, data);
    refresh();
    setEditTarget(null);
    showMsg('ok', `Administrateur "${data.name}" modifié avec succès!`);
  };

  const handleDelete = (id: string) => {
    SubAdminService.delete(id);
    refresh();
    setDeleteConfirm(null);
    showMsg('ok', 'Administrateur supprimé');
  };

  const handleToggleActive = (admin: SubAdminData) => {
    SubAdminService.update(admin.id, { isActive: !admin.isActive });
    refresh();
  };

  const handleChangeSuperPw = () => {
    setSuperPwMsg(null);
    if (!SubAdminService.verifySuperAdminPassword(superPwForm.current)) {
      setSuperPwMsg({ type: 'err', text: 'Mot de passe super-admin actuel incorrect' });
      return;
    }
    if (superPwForm.next.length < 3) {
      setSuperPwMsg({ type: 'err', text: 'Nouveau mot de passe trop court (min. 3 caractères)' });
      return;
    }
    if (superPwForm.next !== superPwForm.confirm) {
      setSuperPwMsg({ type: 'err', text: 'Les mots de passe ne correspondent pas' });
      return;
    }
    SubAdminService.setSuperAdminPassword(superPwForm.next);
    setSuperPwMsg({ type: 'ok', text: '✅ Mot de passe super-admin modifié!' });
    setSuperPwForm({ current: '', next: '', confirm: '' });
  };

  const getRoleInfo = (role: SubAdminData['role']) =>
    ROLES.find(r => r.id === role) || ROLES[2];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/90 flex items-start justify-center overflow-y-auto p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg bg-[#0f0f1a] border border-purple-500/20 rounded-3xl overflow-hidden my-4"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-900/40 to-transparent border-b border-purple-500/20 flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Settings size={20} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-white font-bold font-orbitron">Réglages Avancés</h2>
              <p className="text-white/40 text-xs">Gestion des administrateurs système</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          {!unlocked ? (
            <SuperAdminLock onUnlock={() => setUnlocked(true)} />
          ) : (
            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">

              {/* Message global */}
              <AnimatePresence>
                {msg && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`rounded-xl px-4 py-3 flex items-center gap-2 ${
                      msg.type === 'ok'
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                        : 'bg-red-500/20 border border-red-500/30 text-red-400'
                    }`}
                  >
                    {msg.type === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    <span className="text-sm">{msg.text}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Info principale */}
              <div className="glass rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield size={18} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">Administrateur Principal</p>
                    <p className="text-white/40 text-xs">Accès complet à tous les paramètres</p>
                  </div>
                  <span className="bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs px-2 py-1 rounded-lg font-bold">
                    PRINCIPAL
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-xl p-2.5 text-center">
                    <p className="text-white/40 text-[10px]">Mot de passe principal</p>
                    <p className="text-yellow-400 font-mono text-sm">
                      {localStorage.getItem('dames_admin_password') || '123'}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center">
                    <p className="text-white/40 text-[10px]">Mot de passe réglages</p>
                    <p className="text-purple-400 font-mono text-sm">
                      {SubAdminService.getSuperAdminPassword()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section changer mot de passe super-admin */}
              <div className="glass rounded-2xl border border-purple-500/10 overflow-hidden">
                <button
                  onClick={() => setShowSuperPwSection(!showSuperPwSection)}
                  className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
                >
                  <Key size={16} className="text-purple-400" />
                  <span className="text-white font-semibold text-sm">Modifier le mot de passe super-admin</span>
                  <div className="ml-auto text-white/40">
                    {showSuperPwSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                <AnimatePresence>
                  {showSuperPwSection && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-white/5"
                    >
                      <div className="p-4 space-y-3">
                        {(['current', 'next', 'confirm'] as const).map((field) => (
                          <div key={field}>
                            <label className="text-white/50 text-xs mb-1.5 block">
                              {field === 'current' ? 'Mot de passe super-admin actuel' :
                               field === 'next' ? 'Nouveau mot de passe' :
                               'Confirmer le nouveau mot de passe'}
                            </label>
                            <div className="relative">
                              <input
                                type={superPwShow[field] ? 'text' : 'password'}
                                value={superPwForm[field]}
                                onChange={e => setSuperPwForm(f => ({ ...f, [field]: e.target.value }))}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm pr-12 focus:outline-none focus:border-purple-500/50"
                                placeholder={field === 'current' ? 'Mot de passe actuel' : field === 'next' ? 'Nouveau mot de passe' : 'Confirmer'}
                              />
                              <button
                                onClick={() => setSuperPwShow(s => ({ ...s, [field]: !s[field] }))}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                              >
                                {superPwShow[field] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        ))}

                        <AnimatePresence>
                          {superPwMsg && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={`rounded-xl px-3 py-2 flex items-center gap-2 text-sm ${
                                superPwMsg.type === 'ok'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {superPwMsg.type === 'ok' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                              {superPwMsg.text}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleChangeSuperPw}
                          className="w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                        >
                          <Key size={14} /> Changer le mot de passe réglages
                        </motion.button>

                        <button
                          onClick={() => {
                            SubAdminService.setSuperAdminPassword('1234');
                            setSuperPwMsg({ type: 'ok', text: 'Réinitialisé à "1234"' });
                          }}
                          className="w-full py-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw size={12} /> Réinitialiser à "1234"
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Liste des sous-admins */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Users size={16} className="text-purple-400" />
                    Administrateurs ({subAdmins.length})
                  </h3>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setShowForm(true); setEditTarget(null); }}
                    className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-purple-500/30 transition-all"
                  >
                    <Plus size={14} /> Ajouter
                  </motion.button>
                </div>

                {/* Formulaire de création */}
                <AnimatePresence>
                  {showForm && !editTarget && (
                    <div className="mb-4">
                      <SubAdminForm
                        onSave={handleCreate}
                        onCancel={() => setShowForm(false)}
                      />
                    </div>
                  )}
                </AnimatePresence>

                {/* Liste */}
                {subAdmins.length === 0 ? (
                  <div className="glass rounded-2xl p-8 text-center border border-white/5">
                    <UserCog size={32} className="text-white/20 mx-auto mb-3" />
                    <p className="text-white/40 text-sm">Aucun sous-administrateur créé</p>
                    <p className="text-white/20 text-xs mt-1">
                      Cliquez sur "Ajouter" pour créer un nouveau compte administrateur
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subAdmins.map(admin => {
                      const roleInfo = getRoleInfo(admin.role);
                      const isExpanded = expandedId === admin.id;
                      const isEditing = editTarget?.id === admin.id;

                      return (
                        <motion.div
                          key={admin.id}
                          layout
                          className="glass rounded-2xl border border-white/5 overflow-hidden"
                        >
                          {/* Admin card header */}
                          <div className="p-4 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border ${roleInfo.bg}`}>
                              {roleInfo.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-white font-semibold text-sm truncate">{admin.name}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border flex-shrink-0 ${roleInfo.bg} ${roleInfo.color}`}>
                                  {roleInfo.label}
                                </span>
                              </div>
                              <p className="text-white/40 text-xs truncate">{admin.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${admin.isActive ? 'bg-green-400' : 'bg-red-400'}`} />
                                <span className="text-white/30 text-[10px]">
                                  {admin.isActive ? 'Actif' : 'Inactif'}
                                </span>
                                {admin.lastLogin && (
                                  <span className="text-white/20 text-[10px]">
                                    · Dernier accès: {new Date(admin.lastLogin).toLocaleDateString('fr-FR')}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleToggleActive(admin)}
                                className={`p-1.5 rounded-lg transition-all ${
                                  admin.isActive
                                    ? 'text-green-400/60 hover:text-green-400 hover:bg-green-400/10'
                                    : 'text-red-400/60 hover:text-red-400 hover:bg-red-400/10'
                                }`}
                                title={admin.isActive ? 'Désactiver' : 'Activer'}
                              >
                                <Activity size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditTarget(admin);
                                  setShowForm(false);
                                  setExpandedId(admin.id);
                                }}
                                className="p-1.5 text-blue-400/60 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                                title="Modifier"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(admin.id)}
                                className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : admin.id)}
                                className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded: détails et formulaire d'édition */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-white/5 overflow-hidden"
                              >
                                <div className="p-4">
                                  {isEditing ? (
                                    <SubAdminForm
                                      initial={admin}
                                      onSave={handleEdit}
                                      onCancel={() => setEditTarget(null)}
                                    />
                                  ) : (
                                    <div className="space-y-3">
                                      {/* Mot de passe affiché (admin context) */}
                                      <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <Key size={14} className="text-white/40" />
                                          <span className="text-white/60 text-xs">Mot de passe d'accès</span>
                                        </div>
                                        <span className="font-mono text-yellow-400 text-sm bg-yellow-500/10 px-2 py-1 rounded-lg">
                                          {admin.password}
                                        </span>
                                      </div>

                                      {/* Permissions */}
                                      <div>
                                        <p className="text-white/40 text-xs mb-2 flex items-center gap-1.5">
                                          <Shield size={12} /> Permissions accordées
                                        </p>
                                        <div className="grid grid-cols-1 gap-1.5">
                                          {PERMISSIONS.map(perm => (
                                            <div
                                              key={perm.key}
                                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                                admin.permissions[perm.key as PermKey]
                                                  ? 'bg-green-500/10 text-green-400'
                                                  : 'bg-white/3 text-white/20'
                                              }`}
                                            >
                                              {admin.permissions[perm.key as PermKey]
                                                ? <CheckCircle size={12} />
                                                : <XCircle size={12} />}
                                              {perm.icon}
                                              {perm.label}
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Infos */}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white/5 rounded-xl p-2.5 text-center">
                                          <p className="text-white/30 text-[10px]">Créé le</p>
                                          <p className="text-white/60 text-xs">
                                            {new Date(admin.createdAt).toLocaleDateString('fr-FR')}
                                          </p>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-2.5 text-center">
                                          <p className="text-white/30 text-[10px]">Statut</p>
                                          <p className={`text-xs font-bold ${admin.isActive ? 'text-green-400' : 'text-red-400'}`}>
                                            {admin.isActive ? '✅ Actif' : '❌ Inactif'}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Confirmation de suppression */}
                          <AnimatePresence>
                            {deleteConfirm === admin.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="border-t border-red-500/20 bg-red-500/5 p-4"
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                                  <p className="text-red-400 text-sm font-semibold">
                                    Supprimer "{admin.name}" ?
                                  </p>
                                </div>
                                <p className="text-white/40 text-xs mb-3">
                                  Cette action est irréversible. Le compte administrateur sera définitivement supprimé.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-2 bg-white/10 text-white/60 rounded-xl text-sm font-semibold"
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    onClick={() => handleDelete(admin.id)}
                                    className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                  >
                                    <Trash2 size={14} /> Supprimer
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Guide d'accès */}
              <div className="glass rounded-2xl p-4 border border-white/5">
                <h4 className="text-white/60 text-xs font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle size={12} /> Comment les sous-admins accèdent au panneau
                </h4>
                <div className="space-y-2">
                  {[
                    { step: '1', text: 'Cliquer 5 fois sur le logo dames à l\'accueil' },
                    { step: '2', text: 'Entrer le mot de passe qui leur a été assigné' },
                    { step: '3', text: 'Accès accordé selon leurs permissions uniquement' },
                  ].map(item => (
                    <div key={item.step} className="flex items-start gap-3 bg-white/3 rounded-xl px-3 py-2">
                      <span className="w-5 h-5 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-400 text-[10px] font-bold flex-shrink-0">
                        {item.step}
                      </span>
                      <p className="text-white/40 text-xs">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
