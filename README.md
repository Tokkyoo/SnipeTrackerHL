# HyTracker

Plateforme de suivi et de copy trading pour les contrats perpétuels Hyperliquid, entièrement contrôlée via Telegram.

## 🎯 Fonctionnalités

- **Position Targeting**: Copie l'état des positions (pas les ordres bruts) avec un ratio configurable
- **Multi-Leaders**: Agrège les positions de plusieurs wallets leaders (moyenne pondérée)
- **Risk Management**: 
  - Max leverage par position
  - Max notional total
  - Cooldown entre exécutions
  - Mode PANIC (fermeture d'urgence)
  - Circuit breaker (désactivation automatique après erreurs)
- **Contrôle Telegram**: Toutes les actions critiques via commandes Telegram
- **Modes**: Paper (simulation) et Live (réel)
- **Robustesse**: Retries avec backoff, reduce-only, chunking des ordres
- **État Persistant**: Sauvegarde automatique dans `state.json`

## 📋 Prérequis

- Node.js >= 18
- npm ou yarn
- Compte Hyperliquid avec private key
- Bot Telegram (créé via [@BotFather](https://t.me/botfather))

## 🚀 Installation

```bash
# Cloner ou télécharger le projet
cd "Copy trading"

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Éditer .env avec vos paramètres
notepad .env
```

## ⚙️ Configuration (.env)

```env
# Wallets leaders à suivre (séparés par des virgules)
LEADER_ADDRESSES=0x1234...,0xabcd...

# Clé privée du wallet follower (GARDEZ-LA SECRÈTE!)
FOLLOWER_PRIVATE_KEY=0xVOTRE_CLE_PRIVEE

# Ratio de copie (0.2 = 20% de la taille du leader)
RATIO_DEFAULT=0.2

# Notionnel maximum par ordre (USD)
NOTIONAL_CAP_PER_ORDER_USD=200

# Leverage maximum autorisé
MAX_LEVERAGE=5

# Notionnel total maximum (USD)
MAX_TOTAL_NOTIONAL_USD=2000

# Délai minimum entre exécutions pour un même coin (ms)
COOLDOWN_MS_PER_COIN=2000

# Intervalle de polling (ms)
POLL_INTERVAL_MS=1500

# Token du bot Telegram (obtenu via @BotFather)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# IDs de chat autorisés (whitelist, séparés par des virgules)
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321

# Mode: "paper" (simulation) ou "live" (réel)
MODE=paper

# Time In Force par défaut: "IOC" ou "GTC"
TIF_DEFAULT=IOC

# Dry run: si true, log uniquement sans exécuter (même en live)
DRY_RUN_LOG_ONLY=false

# Fichier de sauvegarde d'état
STATE_FILE=state.json
```

### 🔐 Obtenir votre Chat ID Telegram

1. Envoyez un message à votre bot
2. Visitez: `https://api.telegram.org/bot<VOTRE_TOKEN>/getUpdates`
3. Cherchez `"chat":{"id":123456789}` dans la réponse
4. Ajoutez cet ID dans `TELEGRAM_ALLOWED_CHAT_IDS`

## 🏗️ Build et Exécution

```bash
# Build TypeScript
npm run build

# Démarrer le bot
npm start

# Ou en mode développement (avec ts-node)
npm run dev
```

## 📱 Commandes Telegram

### Contrôle Principal

- `/on` - Active le copy trading automatique
- `/off` - Désactive le copy trading
- `/status` - Affiche l'état complet (config, positions, compteurs)

### Paramètres Runtime

- `/ratio 0.2` - Change le ratio de copie (0.0 - 1.0)
- `/cap 200` - Change le cap notionnel par ordre (USD)
- `/maxlev 5` - Change le leverage maximum
- `/maxnotional 2000` - Change le notionnel total maximum (USD)
- `/tif IOC` - Change le Time In Force (IOC ou GTC)

### Gestion des Leaders

- `/leaders add 0x...` - Ajoute un wallet leader
- `/leaders rm 0x...` - Retire un wallet leader

### Urgence

- `/panic` - **MODE PANIC**: Désactive le trading et tente de fermer toutes les positions
- `/resume` - Désactive le mode panic (utiliser `/on` ensuite pour reprendre)

### Aide

- `/help` - Liste toutes les commandes

## 🏛️ Architecture

```
src/
├── index.ts                    # Point d'entrée principal
├── config.ts                   # Configuration depuis .env
├── core/
│   ├── positionModel.ts       # Types et interfaces
│   ├── aggregator.ts          # Agrégation multi-leaders
│   ├── targeting.ts           # Calcul des targets et génération d'ordres
│   ├── riskEngine.ts          # Moteur de gestion des risques
│   ├── executor.ts            # Exécution avec retries
│   └── loop.ts                # Boucle principale de copy trading
├── hyperliquid/
│   ├── infoClient.ts          # API lecture (positions, prix)
│   └── exchangeClient.ts      # API exécution (ordres)
├── telegram/
│   └── bot.ts                 # Contrôleur Telegram
├── store/
│   └── stateStore.ts          # Gestion d'état persistant
└── utils/
    └── logger.ts              # Logging structuré
```

## 🧪 Tests

```bash
# Exécuter les tests unitaires
npm test

# Tests avec coverage
npm test -- --coverage
```

Les tests couvrent:
- Calculs de targeting (delta, reduce-only, chunking)
- Risk engine (cooldown, panic, circuit breaker, leverage)

## 🔧 Modes d'Exécution

### Mode Paper (Simulation)

```env
MODE=paper
DRY_RUN_LOG_ONLY=false
```

- Les ordres ne sont **pas envoyés** à Hyperliquid
- Logs et notifications Telegram comme en live
- Parfait pour tester la logique sans risque

### Mode Live (Réel)

```env
MODE=live
DRY_RUN_LOG_ONLY=false
```

- Les ordres sont **réellement exécutés** sur Hyperliquid
- ⚠️ **UTILISEZ AVEC PRÉCAUTION**
- Commencez avec des petits montants

### Mode Dry-Run Log Only

```env
MODE=live
DRY_RUN_LOG_ONLY=true
```

- Log les ordres sans les exécuter (même en mode live)
- Utile pour debug en conditions réelles

## 📊 Observabilité

### Logs

- Format JSON structuré (pino)
- Niveaux: debug, info, warn, error
- Redaction automatique des clés privées

```bash
# Changer le niveau de log
LOG_LEVEL=debug npm start
```

### Métriques

Disponibles via `/status`:
- Nombre d'exécutions
- Nombre de rejets (risk checks)
- Nombre d'erreurs
- État du circuit breaker
- Positions actuelles

## 🛡️ Sécurité

### ⚠️ IMPORTANT

- **JAMAIS** commiter le fichier `.env`
- **JAMAIS** partager votre `FOLLOWER_PRIVATE_KEY`
- Limitez `TELEGRAM_ALLOWED_CHAT_IDS` à vos propres chat IDs
- Commencez toujours en mode `paper`
- Utilisez des montants faibles en mode `live`

### Risk Management

Le bot implémente plusieurs couches de protection:

1. **Reduce-Only**: Lors de la fermeture/réduction de positions
2. **Cooldown**: Évite le spam d'ordres sur un même coin
3. **Caps**: Limite par ordre et notionnel total
4. **Max Leverage**: Protection contre l'over-leverage
5. **Circuit Breaker**: Désactivation automatique après erreurs répétées
6. **PANIC Mode**: Arrêt d'urgence + fermeture des positions

## 🔄 Fonctionnement

### Position Targeting

Le bot ne copie **pas** les ordres bruts, mais vise un **état de position cible**:

```
Target Size = Leader Size × Ratio
Delta = Target Size - Current Follower Size

Si Delta > 0 → Buy
Si Delta < 0 → Sell (reduce-only si on réduit la position)
```

### Chunking

Si un ordre dépasse `NOTIONAL_CAP_PER_ORDER_USD`, il est automatiquement divisé en plusieurs ordres plus petits.

### Reduce-Only

Le bot utilise `reduceOnly=true` quand:
- Position long: target < current
- Position short: target > current (plus proche de 0)

Cela évite de "dépasser" la cible et inverser accidentellement la position.

## 📝 TODOs & Limitations

### Implémentation Hyperliquid

Les fichiers suivants contiennent des TODOs pour l'intégration API réelle:

- `src/hyperliquid/infoClient.ts`: Endpoints pour positions et prix
- `src/hyperliquid/exchangeClient.ts`: Signature et placement d'ordres
- `src/index.ts`: Dérivation de l'adresse depuis la private key

**Structure attendue** (à confirmer avec la doc Hyperliquid):
- Info API: `POST /info` avec `{"type": "clearinghouseState", "user": "0x..."}`
- Exchange API: `POST /exchange` avec payload signé (EIP-712)

### Fonctionnalités Futures

- WebSocket pour updates temps réel (au lieu du polling)
- Stratégies d'agrégation avancées (pondération, filtre)
- Dashboard web (optionnel)
- Notifications Discord/Slack
- Backtesting framework
- Multi-exchange support

## 🐛 Dépannage

### Le bot ne répond pas aux commandes Telegram

- Vérifiez que votre `TELEGRAM_ALLOWED_CHAT_IDS` contient votre chat ID
- Vérifiez les logs pour voir si les messages arrivent
- Testez `/help` pour voir si le bot est actif

### Erreurs de compilation

```bash
# Nettoyer et réinstaller
rm -rf node_modules dist
npm install
npm run build
```

### Le bot ne détecte pas les positions

- Vérifiez que les endpoints Hyperliquid dans `infoClient.ts` sont corrects
- Implémentez les TODOs dans `infoClient.ts`
- Testez avec des wallets connus ayant des positions

### Circuit breaker déclenché

- Vérifiez les logs pour identifier la cause des erreurs
- Corrigez le problème (réseau, API, etc.)
- Utilisez `/resume` puis `/on` pour redémarrer

## 📜 Licence

MIT

## 🤝 Support

Pour toute question ou problème:
1. Vérifiez les logs (`tail -f *.log` si vous en créez)
2. Testez d'abord en mode `paper`
3. Consultez la documentation Hyperliquid API

---

**⚠️ Disclaimer**: Ce bot est fourni "tel quel" à des fins éducatives. L'utilisation en mode live comporte des risques financiers. Testez toujours en mode paper d'abord. Les auteurs ne sont pas responsables des pertes financières.
