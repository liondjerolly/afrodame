import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initializeDatabase, autoInitSupabase } from "./lib/database";

// Suppress React DevTools message
if (typeof window !== 'undefined') {
  (window as Window & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { isDisabled: boolean } }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true };
}

// 1. Initialiser les données locales (synchrone — immédiat)
initializeDatabase();

// 2. Connecter et synchroniser Supabase (asynchrone — en arrière-plan)
autoInitSupabase().then(() => {
  console.info('[App] Base de données prête.');
}).catch(err => {
  console.warn('[App] Supabase non disponible — mode localStorage.', err);
});

createRoot(document.getElementById("root")!).render(<App />);
