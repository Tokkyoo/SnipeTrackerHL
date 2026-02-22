// WebSocket connection
const socket = io();

// State
let isPaused = false;
let feedItems = [];

// Elements
const elements = {
    statusBadge: document.getElementById('statusBadge'),
    totalPnl: document.getElementById('totalPnl'),
    winRate: document.getElementById('winRate'),
    openPositions: document.getElementById('openPositions'),
    todayTrades: document.getElementById('todayTrades'),
    leadersList: document.getElementById('leadersList'),
    positionsList: document.getElementById('positionsList'),
    positionsCount: document.getElementById('positionsCount'),
    feedContainer: document.getElementById('feedContainer'),
    clearFeed: document.getElementById('clearFeed'),
    pauseFeed: document.getElementById('pauseFeed')
};

// WebSocket Events
socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus(true);
    addSystemMessage('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateStatus(false);
    addSystemMessage('Disconnected from server', 'error');
});

socket.on('initialData', (data) => {
    console.log('Received initial data:', data);
    updateDashboard(data);
});

socket.on('positionsUpdate', (positions) => {
    console.log('Positions update:', positions);
    updatePositions(positions);
});

socket.on('leadersUpdate', (leaders) => {
    console.log('Leaders update:', leaders);
    updateLeaders(leaders);
});

socket.on('newTrade', (trade) => {
    console.log('New trade:', trade);
    if (!isPaused) {
        addTradeToFeed(trade);
    }
});

socket.on('statsUpdate', (stats) => {
    console.log('Stats update:', stats);
    updateStats(stats);
});

// Update Functions
function updateStatus(connected) {
    if (connected) {
        elements.statusBadge.classList.remove('disconnected');
        elements.statusBadge.querySelector('span:last-child').textContent = 'Connected';
    } else {
        elements.statusBadge.classList.add('disconnected');
        elements.statusBadge.querySelector('span:last-child').textContent = 'Disconnected';
    }
}

function updateDashboard(data) {
    updateStats(data.stats);
    updatePositions(data.positions);
    updateLeaders(data.leaders);
    
    // Add recent trades to feed
    if (data.recentTrades && data.recentTrades.length > 0) {
        elements.feedContainer.innerHTML = '';
        data.recentTrades.reverse().forEach(trade => addTradeToFeed(trade, false));
    }
}

function updateStats(stats) {
    elements.totalPnl.textContent = formatCurrency(stats.totalPnL || 0);
    elements.totalPnl.className = 'stat-value ' + (stats.totalPnL >= 0 ? 'positive' : 'negative');
    
    elements.winRate.textContent = (stats.winRate || 0).toFixed(1) + '%';
    elements.openPositions.textContent = stats.openPositions || 0;
    elements.todayTrades.textContent = stats.todayTrades || 0;
}

function updatePositions(positions) {
    const openPositions = positions.filter(p => p.size !== 0);
    elements.positionsCount.textContent = openPositions.length;
    
    if (openPositions.length === 0) {
        elements.positionsList.innerHTML = '<div class="empty-state">No open positions</div>';
        return;
    }
    
    elements.positionsList.innerHTML = openPositions.map(pos => {
        const side = pos.size > 0 ? 'long' : 'short';
        const sizeAbs = Math.abs(pos.size);
        const notional = sizeAbs * (pos.entryPx || 0);
        const pnl = pos.unrealizedPnl || 0;
        const pnlPercent = pos.returnOnEquity ? (pos.returnOnEquity * 100) : 0;
        
        return `
            <div class="position-item ${side}">
                <div class="position-header">
                    <span class="position-coin">${pos.coin}</span>
                    <span class="position-side ${side}">${side}</span>
                </div>
                <div class="position-details">
                    <div class="position-detail">
                        <span class="position-detail-label">Size:</span>
                        <span class="position-detail-value">${formatNumber(sizeAbs)}</span>
                    </div>
                    <div class="position-detail">
                        <span class="position-detail-label">Entry:</span>
                        <span class="position-detail-value">$${formatNumber(pos.entryPx || 0)}</span>
                    </div>
                    <div class="position-detail">
                        <span class="position-detail-label">Notional:</span>
                        <span class="position-detail-value">${formatCurrency(notional)}</span>
                    </div>
                    <div class="position-detail">
                        <span class="position-detail-label">PnL:</span>
                        <span class="position-detail-value ${pnl >= 0 ? 'positive' : 'negative'}">
                            ${formatCurrency(pnl)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateLeaders(leaders) {
    if (!leaders || leaders.length === 0) {
        elements.leadersList.innerHTML = '<div class="empty-state">No leaders tracked</div>';
        return;
    }
    
    // Fetch state to get nicknames
    fetch('/api/state')
        .then(res => res.json())
        .then(state => {
            elements.leadersList.innerHTML = leaders.map(leader => {
                const nickname = state.leaderNicknames?.[leader.address] || 'Unknown';
                const perf = state.leaderPerformance?.[leader.address];
                const pnl = perf?.totalPnL || 0;
                
                return `
                    <div class="leader-item">
                        <div class="leader-header">
                            <span class="leader-name">${nickname}</span>
                            <span class="leader-pnl ${pnl >= 0 ? 'positive' : 'negative'}">
                                ${formatCurrency(pnl)}
                            </span>
                        </div>
                        <div class="leader-address">${shortenAddress(leader.address)}</div>
                    </div>
                `;
            }).join('');
        });
}

function addTradeToFeed(trade, animate = true) {
    const time = new Date(trade.timestamp || Date.now()).toLocaleTimeString();
    const type = trade.type || 'trade';
    const side = trade.side || 'buy';
    
    let title = '📊 Trade';
    let text = '';
    
    if (type === 'position_opened') {
        title = side === 'buy' ? '🟢 Long Opened' : '🔴 Short Opened';
        text = `${trade.coin}: ${formatNumber(Math.abs(trade.size))} @ $${formatNumber(trade.price)}`;
    } else if (type === 'position_closed') {
        title = '✅ Position Closed';
        text = `${trade.coin}: ${formatNumber(Math.abs(trade.size))} @ $${formatNumber(trade.price)}`;
        if (trade.pnl !== undefined) {
            text += ` | PnL: ${formatCurrency(trade.pnl)}`;
        }
    } else if (type === 'position_changed') {
        title = '📈 Position Updated';
        text = `${trade.coin}: Size changed to ${formatNumber(Math.abs(trade.size))}`;
    } else if (type === 'error') {
        title = '❌ Error';
        text = trade.message || 'Unknown error';
    } else {
        text = trade.message || JSON.stringify(trade);
    }
    
    const feedItem = document.createElement('div');
    feedItem.className = `feed-item ${type}`;
    if (side === 'sell') feedItem.classList.add('sell');
    
    feedItem.innerHTML = `
        <div class="feed-time">${time}</div>
        <div class="feed-content">
            <div class="feed-title">${title}</div>
            <div class="feed-text">${text}</div>
        </div>
    `;
    
    if (elements.feedContainer.firstChild) {
        elements.feedContainer.insertBefore(feedItem, elements.feedContainer.firstChild);
    } else {
        elements.feedContainer.appendChild(feedItem);
    }
    
    // Keep only last 100 items
    while (elements.feedContainer.children.length > 100) {
        elements.feedContainer.removeChild(elements.feedContainer.lastChild);
    }
}

function addSystemMessage(message, type = 'system') {
    addTradeToFeed({
        type: type,
        message: message,
        timestamp: Date.now()
    });
}

// UI Controls
elements.clearFeed.addEventListener('click', () => {
    elements.feedContainer.innerHTML = '';
    addSystemMessage('Feed cleared');
});

elements.pauseFeed.addEventListener('click', () => {
    isPaused = !isPaused;
    elements.pauseFeed.textContent = isPaused ? '▶️' : '⏸️';
    elements.pauseFeed.title = isPaused ? 'Resume feed' : 'Pause feed';
    addSystemMessage(isPaused ? 'Feed paused' : 'Feed resumed');
});

// Utility Functions
function formatCurrency(value) {
    const num = Number(value);
    if (Math.abs(num) >= 1000000) {
        return '$' + (num / 1000000).toFixed(2) + 'M';
    } else if (Math.abs(num) >= 1000) {
        return '$' + (num / 1000).toFixed(2) + 'K';
    }
    return '$' + num.toFixed(2);
}

function formatNumber(value) {
    const num = Number(value);
    if (Math.abs(num) >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (Math.abs(num) >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

function shortenAddress(address) {
    if (!address) return '';
    return address.slice(0, 6) + '...' + address.slice(-4);
}

// Initial load
console.log('Dashboard loaded');
