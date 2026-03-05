import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { Eye, EyeOff, Mail, Phone, User, Lock, ArrowLeft, CheckCircle, Loader2, Gift, AlertTriangle } from 'lucide-react';

export default function AuthView() {
  const { authMode, setAuthMode, login, register, forgotPassword, dbLoading } = useGameStore();
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '', name: '', phone: '', email: '', password: '', confirmPassword: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await login(form.email, form.password);
    setLoading(false);
    if (!ok) setError('Email ou mot de passe incorrect. Vérifiez vos identifiants.');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.firstName || !form.name || !form.phone || !form.email || !form.password) {
      setError('Tous les champs sont obligatoires');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (form.password.length < 6) {
      setError('Mot de passe: minimum 6 caractères');
      return;
    }
    // Validation format téléphone simple
    if (form.phone.length < 8) {
      setError('Numéro de téléphone invalide (minimum 8 chiffres)');
      return;
    }
    setLoading(true);
    const errorCode = await register(form);
    setLoading(false);
    if (errorCode === 'email_taken') {
      setError('⚠️ Cette adresse email est déjà utilisée. Utilisez une autre email ou connectez-vous.');
    } else if (errorCode === 'phone_taken') {
      setError('⚠️ Ce numéro de téléphone est déjà utilisé. Utilisez un autre numéro ou connectez-vous.');
    } else if (errorCode === 'unknown') {
      setError('Une erreur est survenue. Veuillez réessayer.');
    }
    // errorCode === null → succès, redirection automatique
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await forgotPassword(form.email);
    setLoading(false);
    if (ok) {
      setSuccess(`Un message de réinitialisation a été envoyé à ${form.email}. Vérifiez votre boite mail et suivez les instructions pour restaurer votre mot de passe.`);
    } else {
      setError('Aucun compte trouvé avec cet email');
    }
  };

  const isLoading = loading || dbLoading;
  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/60 focus:bg-white/10 transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] relative overflow-hidden px-4">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-red-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-green-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="text-5xl mb-3"
          >♟</motion.div>
          <h1 className="text-2xl font-bold font-orbitron gradient-gold">Dames Africaines Pro</h1>
          <p className="text-white/50 text-sm mt-1">Championnat en ligne</p>
        </div>

        <div className="glass-dark rounded-3xl p-8">
          {/* Tabs */}
          {authMode !== 'forgot' && (
            <div className="flex gap-2 mb-6 bg-white/5 rounded-xl p-1">
              <button
                onClick={() => { setAuthMode('login'); setError(''); setSuccess(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${authMode === 'login' ? 'bg-yellow-500 text-black' : 'text-white/60 hover:text-white'}`}
              >
                Connexion
              </button>
              <button
                onClick={() => { setAuthMode('register'); setError(''); setSuccess(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${authMode === 'register' ? 'bg-yellow-500 text-black' : 'text-white/60 hover:text-white'}`}
              >
                Inscription
              </button>
            </div>
          )}

          {authMode === 'forgot' && (
            <button
              onClick={() => { setAuthMode('login'); setError(''); setSuccess(''); }}
              className="flex items-center gap-2 text-white/60 hover:text-white mb-6 text-sm transition-colors"
            >
              <ArrowLeft size={16} /> Retour à la connexion
            </button>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 text-red-300 text-sm mb-4 flex items-start gap-2"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {success && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className="bg-green-500/20 border border-green-500/40 rounded-xl px-4 py-3 text-green-300 text-sm mb-4 flex items-start gap-2">
              <CheckCircle size={16} className="mt-0.5 shrink-0" />
              <span>{success}</span>
            </motion.div>
          )}

          {/* Login */}
          {authMode === 'login' && (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="email" placeholder="Adresse email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className={`${inputClass} pl-10`} required />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type={showPass ? 'text' : 'password'} placeholder="Mot de passe" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className={`${inputClass} pl-10 pr-10`} required />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button type="button" onClick={() => { setAuthMode('forgot'); setError(''); }}
                className="text-yellow-400 text-sm hover:text-yellow-300 transition-colors">
                Mot de passe oublié?
              </button>
              <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={isLoading}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-3 rounded-xl hover:from-yellow-400 hover:to-yellow-500 transition-all shadow-lg shadow-yellow-500/30 flex items-center justify-center gap-2 disabled:opacity-70">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Se connecter'}
              </motion.button>
              <div className="text-center text-white/30 text-xs mt-2 space-y-1">
                <p>Démo: <span className="text-yellow-400/70">demo@dames.com</span> / <span className="text-yellow-400/70">demo123</span></p>
                <p>Admin: <span className="text-red-400/70">admin@dames.com</span> / <span className="text-red-400/70">admin2024</span></p>
              </div>
            </motion.form>
          )}

          {/* Register */}
          {authMode === 'register' && (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleRegister}
              className="space-y-3"
            >
              {/* Wallet virtuel promo banner */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-green-500/20 to-yellow-500/20 border border-green-500/30 rounded-xl p-3 flex items-center gap-3"
              >
                <Gift size={20} className="text-green-400 shrink-0" />
                <div>
                  <p className="text-green-300 text-xs font-bold">🎁 Bonus d'inscription</p>
                  <p className="text-white/60 text-xs">54 000 FC + 200$ virtuels offerts pour tester!</p>
                </div>
              </motion.div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input type="text" placeholder="Prénom" value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })}
                    className={`${inputClass} pl-9 text-sm`} required />
                </div>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input type="text" placeholder="Nom" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className={`${inputClass} pl-9 text-sm`} required />
                </div>
              </div>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="tel" placeholder="Téléphone (+243...)" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className={`${inputClass} pl-10`} required />
              </div>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="email" placeholder="Adresse email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className={`${inputClass} pl-10`} required />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type={showPass ? 'text' : 'password'} placeholder="Mot de passe (min 6 chars)" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className={`${inputClass} pl-10 pr-10`} required />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type={showPass ? 'text' : 'password'} placeholder="Confirmer mot de passe" value={form.confirmPassword}
                  onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                  className={`${inputClass} pl-10`} required />
              </div>

              {/* Indicateur force mot de passe */}
              {form.password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-all ${
                        form.password.length >= i * 3
                          ? i <= 1 ? 'bg-red-500' : i <= 2 ? 'bg-orange-500' : i <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                          : 'bg-white/10'
                      }`} />
                    ))}
                  </div>
                  <p className="text-white/30 text-xs">
                    {form.password.length < 6 ? 'Trop court' : form.password.length < 9 ? 'Moyen' : form.password.length < 12 ? 'Bon' : 'Excellent'}
                  </p>
                </div>
              )}

              <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={isLoading}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-3 rounded-xl hover:from-yellow-400 hover:to-yellow-500 transition-all shadow-lg shadow-yellow-500/30 flex items-center justify-center gap-2 disabled:opacity-70">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : '🎮 Créer mon compte & Jouer'}
              </motion.button>

              <p className="text-white/20 text-xs text-center">
                En créant un compte, vous acceptez les conditions d'utilisation
              </p>
            </motion.form>
          )}

          {/* Forgot Password */}
          {authMode === 'forgot' && !success && (
            <motion.form
              key="forgot"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleForgot}
              className="space-y-4"
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">🔐</div>
                <h3 className="text-white font-semibold text-lg">Mot de passe oublié</h3>
                <p className="text-white/50 text-sm mt-1">
                  Entrez votre email pour recevoir votre mot de passe de restauration
                </p>
              </div>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input type="email" placeholder="Votre adresse email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className={`${inputClass} pl-10`} required />
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <p className="text-blue-300 text-xs">
                  📧 Un message contenant votre mot de passe de restauration sera envoyé à votre adresse email pour accéder à votre compte.
                </p>
              </div>
              <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={isLoading}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-3 rounded-xl hover:from-yellow-400 hover:to-yellow-500 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : '📨 Envoyer le message'}
              </motion.button>
            </motion.form>
          )}

          {/* Success after forgot */}
          {authMode === 'forgot' && success && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✉️</div>
              <h3 className="text-white font-bold text-lg mb-2">Message envoyé!</h3>
              <p className="text-white/60 text-sm mb-6">{success}</p>
              <button onClick={() => { setAuthMode('login'); setSuccess(''); }}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-3 rounded-xl">
                Retour à la connexion
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
