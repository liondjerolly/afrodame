# AfroDame

Application web de Jeu de Dames africain (React + TypeScript + Vite) avec Supabase (DB + Realtime), déployée sur Vercel.

## Prérequis

- Node.js 20+
- npm
- Projet Supabase

## Installation locale

1. Installer les dépendances:

```bash
npm install
```

2. Créer `.env.local` à la racine:

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon
```

3. Appliquer les migrations SQL dans l'ordre:

- `supabase/migrations/202603050001_stabilize_online_core.sql`
- `supabase/migrations/202603050002_advanced_ai_spectator.sql`

4. Lancer l'application:

```bash
npm run dev
```

5. Vérifier le build:

```bash
npm run build
```

## Déploiement Vercel

Configurer les variables d'environnement:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Puis redéployer.

Le fichier `vercel.json` inclut une réécriture SPA vers `index.html` pour supporter la route `/ia`.

## Fonctionnalités Step 1 (stables)

- Défis en ligne avec acceptation atomique (`accept_challenge_atomic`)
- Expiration automatique des défis à 24h
- Gating d'acceptation (pas de jeu avant acceptation)
- Dashboard et chat en temps réel
- Chat en lecture seule quand défi/partie n'est plus actif
- Gating mode démo pour utilisateurs authentifiés
- Liste wallet corrigée (M-Pesa, Orange Money, Airtel Money, AfriMoney)

## Fonctionnalités Step 2

- Nouvelle page dédiée IA: `Arène IA` (`/ia` via vue `arena-ia`)
- IA modulaire avec niveaux:
  - `Facile`: coup légal aléatoire
  - `Moyen`: stratégie gloutonne (captures prioritaires)
  - `Difficile`: minimax profondeur fixe
- Mode `IA vs IA` avec:
  - vitesse normale
  - avance rapide
- Analyse IA:
  - liste des coups
  - stats (nombre de coups, captures, durée, gagnant)
- Mode spectateur en direct (lecture seule):
  - liste des matchs actifs
  - affichage plateau en temps réel via updates `matches`
- Persistance des coups en base:
  - table `match_moves`
  - champs `move_number`, `from/to`, `captured_pieces`, `player_type`, `created_at`

## Plan de test manuel (Step 2)

1. Arène IA
- Ouvrir la vue `Arène IA` depuis la navigation.
- Vérifier présence des sections: `Humain vs IA`, `IA vs IA`, `Analyse IA`.

2. Humain vs IA
- Lancer une partie avec `Facile`, `Moyen`, puis `Difficile`.
- Vérifier que les labels de difficulté sont en français.

3. IA vs IA
- Lancer une simulation en vitesse normale.
- Vérifier progression automatique des coups.
- Passer en avance rapide et vérifier accélération.

4. Persistance des coups
- À la fin d'un match IA vs IA, vérifier en DB:
  - ligne dans `matches` (mode `ai_arena`)
  - lignes dans `match_moves` avec ordre des coups et captures.

5. Analyse IA
- Sélectionner un match IA terminé.
- Vérifier affichage:
  - liste des coups
  - nombre de coups
  - nombre de captures
  - durée
  - gagnant

6. Spectateur (lecture seule)
- Ouvrir un match actif depuis la section spectateurs.
- Vérifier mise à jour du plateau pendant le match.
- Vérifier absence de toute interaction de jeu côté spectateur.
