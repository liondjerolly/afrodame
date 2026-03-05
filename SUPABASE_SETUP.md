# Configuration Supabase

## 1) Créer le projet

1. Ouvrir https://app.supabase.com
2. Créer un nouveau projet
3. Choisir une région proche des joueurs

## 2) Appliquer le schéma et les migrations

1. Exécuter `src/lib/schema.sql` dans SQL Editor
2. Exécuter ensuite les migrations:
   - `supabase/migrations/202603050001_stabilize_online_core.sql`
   - `supabase/migrations/202603050002_advanced_ai_spectator.sql`

La migration Step 2 ajoute:

- mode de match `ai_arena`
- table `match_moves` (persistance des coups)
- politique RLS lecture des coups + insertion sur match actif
- publication Realtime sur `match_moves`

## 3) Variables d'environnement

Créer `.env.local`:

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon
```

## 4) Realtime

Dans `Database > Replication`, activer:

- `notifications`
- `chat_messages`
- `challenges`
- `matches`
- `match_moves`

## 5) Vercel

Dans `Project Settings > Environment Variables`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 6) Notes

- L'application garde un fallback localStorage si Supabase est indisponible.
- Pour une séparation stricte participants/spectateurs côté RLS, il est recommandé d'activer Supabase Auth/JWT par utilisateur.

