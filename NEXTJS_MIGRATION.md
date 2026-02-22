# HyTracker - Next.js Migration

## 🚀 Architecture

Le projet a été migré vers **Next.js avec App Router** tout en conservant le backend Express existant.

### Structure

```
- app/                    # Next.js App Router (Frontend)
  - layout.tsx           # Layout principal avec navigation
  - page.tsx             # Page d'accueil
  - dashboard/           # Dashboard de trading
  - feed/                # Feed en temps réel
  - api/                 # API Routes Next.js (proxies)
- src/                    # Backend Express (inchangé)
- components/             # Composants React réutilisables
- public/                 # Assets statiques (ancien frontend)
```

### Ports

- **Frontend (Next.js)**: http://localhost:3000
- **Backend (Express + Socket.io)**: http://localhost:3001

## 📦 Installation

```bash
npm install
```

## 🏃 Lancement

### Option 1: Lancer frontend et backend séparément

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev
```

### Option 2: Lancer les deux en même temps

```bash
npm run dev:full
```

## 🎨 Features

### ✅ Implémenté

- ✅ Next.js 14 avec App Router
- ✅ Tailwind CSS pour le styling
- ✅ Dashboard React avec données temps réel
- ✅ Feed de trading en direct
- ✅ Socket.io pour les updates temps réel
- ✅ API Routes comme proxies vers le backend
- ✅ TypeScript complet
- ✅ Design moderne et responsive

### 📊 Pages

1. **Home** (`/`) - Vue d'ensemble avec stats
2. **Dashboard** (`/dashboard`) - Positions actives et métriques
3. **Feed** (`/feed`) - Flux de trading en temps réel

## 🔧 Scripts

```json
{
  "dev": "next dev",                          // Frontend Next.js
  "dev:backend": "ts-node src/index.ts",      // Backend Express
  "dev:full": "concurrently ...",             // Les deux simultanément
  "build": "next build",                      // Build Next.js
  "build:backend": "tsc",                     // Build backend
  "start": "next start",                      // Prod Next.js
  "start:backend": "node dist/index.js"       // Prod backend
}
```

## 🌐 Communication Frontend ↔ Backend

### REST API (via Next.js API Routes)

```typescript
// app/api/state/route.ts
export async function GET() {
  const response = await fetch('http://localhost:3001/state');
  return NextResponse.json(await response.json());
}
```

### WebSocket (Socket.io)

```typescript
// Dans les composants React
const socket = io('http://localhost:3001');
socket.on('positions', (data) => {
  setPositions(data);
});
```

## 🎨 Styling

Tailwind CSS avec thème dark personnalisé :

- Background: `bg-gray-900`
- Cards: `bg-gray-800`
- Borders: `border-gray-700`
- Accents: `blue-400`, `purple-400`, `green-400`, `red-400`

## 🔄 Migration depuis l'ancien frontend

Les anciens fichiers HTML sont toujours dans `/public` mais ne sont plus utilisés. Le nouveau frontend React les remplace complètement.

## 📝 TODO

- [ ] Ajouter graphiques (Chart.js ou Recharts)
- [ ] Panneau de configuration des risques
- [ ] Historique des trades
- [ ] Filtres avancés dans le feed
- [ ] Authentification
- [ ] Dark/Light mode toggle

## 🐛 Debug

Si le frontend ne se connecte pas au backend :

1. Vérifier que le backend tourne sur le port 3001
2. Vérifier les logs Socket.io dans la console
3. S'assurer que CORS est bien configuré

## 📚 Technologies

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Express, Socket.io, TypeScript
- **Communication**: REST API + WebSocket
- **Build**: Next.js build system + tsc
