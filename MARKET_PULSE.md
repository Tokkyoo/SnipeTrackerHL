# Market Pulse Feature 📊

## Vue d'ensemble

La feature **Market Pulse** affiche le sentiment de marché en temps réel basé sur l'activité de trading récente des leaders que vous suivez.

## Comment ça fonctionne

### Calcul du sentiment

- **Fenêtre temporelle**: 5 minutes par défaut
- **Données**: Tous les trade events (buy/sell) du live feed
- **Calcul**: Pourcentage de LONG vs SHORT pour chaque market

### Classification du sentiment

- **Bullish** (↑ vert): ≥ 65% de trades LONG
- **Bearish** (↓ rouge): ≥ 65% de trades SHORT  
- **Neutral** (→ gris): Entre 35% et 65%

## Affichage

Le Market Pulse s'affiche en haut du Live Feed avec :

- **Top 8 markets** par volume USD
- **Pourcentage dominant** (LONG ou SHORT)
- **Flèche directionnelle** colorée
- **Mise à jour automatique** toutes les 10 secondes

### Exemple visuel

```
ETH → ↑ 72.3% LONG
SOL → ↓ 81.5% SHORT
HYPE → → 52.1% MIXED
```

## API Backend

### Endpoint REST

```
GET /api/market-pulse?window=300000&weighted=false
```

**Paramètres**:
- `window` (optionnel): Fenêtre temporelle en ms (défaut: 300000 = 5min)
- `weighted` (optionnel): Pondérer par notional USD (défaut: false)

**Réponse**:
```json
[
  {
    "market": "ETH",
    "longPct": 72.3,
    "shortPct": 27.7,
    "totalTrades": 45,
    "totalNotionalUsd": 125430.50,
    "sentiment": "bullish"
  }
]
```

### WebSocket Event

Le serveur envoie automatiquement des mises à jour via WebSocket :

```javascript
socket.on('marketPulseUpdate', (pulse) => {
  // pulse est un array de MarketPulseRow
  console.log(pulse);
});
```

## Implémentation technique

### Backend

**Fichiers créés/modifiés**:
- `src/analysis/marketPulse.ts` - Logique de calcul
- `src/server/dashboardServer.ts` - Endpoint + WebSocket

**Fonction principale**:
```typescript
computeMarketPulse(
  events: FeedEvent[],
  windowMs: number = 5 * 60 * 1000,
  weighted: boolean = false
): MarketPulseRow[]
```

### Frontend

**Fichiers modifiés**:
- `public/feed.html` - Nouveau container Market Pulse
- `public/feed.js` - Gestion WebSocket et rendering
- `public/feed.css` - Styles du composant

**État**:
```javascript
let marketPulseData = []; // Array de MarketPulseRow
```

## Variante V2 (disponible)

### Pondération par volume

Activez la pondération par notional USD :

```javascript
// Backend
const pulse = computeMarketPulse(events, windowMs, true);

// Frontend API call
fetch('/api/market-pulse?weighted=true')
```

Cette variante donne plus de poids aux gros trades.

## Configuration

### Changer la fenêtre temporelle

Dans `src/server/dashboardServer.ts`:
```typescript
private marketPulseWindowMs: number = 10 * 60 * 1000; // 10 minutes
```

### Changer la fréquence de mise à jour

Dans `startMarketPulseBroadcast()`:
```typescript
this.marketPulseInterval = setInterval(() => {
  // ...
}, 30000); // 30 secondes au lieu de 10
```

### Changer le nombre de markets affichés

Dans `public/feed.js`, fonction `renderMarketPulse()`:
```javascript
const topMarkets = marketPulseData.slice(0, 12); // Afficher 12 au lieu de 8
```

## Couleurs et thèmes

Les couleurs sont définies dans `feed.css`:

```css
--accent-green: #10b981;  /* Bullish */
--accent-red: #ef4444;    /* Bearish */
--text-muted: #6b7280;    /* Neutral */
```

## Performance

- **Impact minimal**: Le calcul se fait toutes les 10 secondes
- **Données en mémoire**: Utilise le feed existant (max 500 events)
- **WebSocket efficace**: Broadcast uniquement les changements

## Utilisation

1. **Démarrer le dashboard**: `npm run dev`
2. **Ouvrir le feed**: http://localhost:3000/feed.html
3. **Observer le Market Pulse** en haut de la page
4. Le composant se met à jour automatiquement

## Extension future

Idées pour améliorer la feature :

1. **Filtres personnalisés** par market
2. **Alertes** quand un market change de sentiment
3. **Historique** des sentiments sur graphique
4. **Comparaison** avec le prix réel
5. **PnL tracking** par sentiment
