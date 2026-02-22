// WebSocket connection
const socket = io();

// State
let isPaused = false;
let events = [];
let filteredEvents = [];
let eventsPerMinute = 0;
let eventCountsLastMinute = [];
let leaderNicknames = {}; // Store nicknames

// Elements
const elements = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    eventsPerMin: document.getElementById('eventsPerMin'),
    totalEvents: document.getElementById('totalEvents'),
    clearBtn: document.getElementById('clearBtn'),
    manageLeadersBtn: document.getElementById('manageLeadersBtn'),
    searchInput: document.getElementById('searchInput'),
    marketSearch: document.getElementById('marketSearch'),
    marketFilter: document.getElementById('marketFilter'),
    marketDropdown: document.getElementById('marketDropdown'),
    sideFilter: document.getElementById('sideFilter'),
    eventTypeFilter: document.getElementById('eventTypeFilter'),
    feedContainer: document.getElementById('feedContainer'),
    leadersModal: document.getElementById('leadersModal'),
    closeModal: document.getElementById('closeModal'),
    addLeaderBtn: document.getElementById('addLeaderBtn'),
    newLeaderAddress: document.getElementById('newLeaderAddress'),
    newLeaderNickname: document.getElementById('newLeaderNickname'),
    leadersList: document.getElementById('leadersList')
};

// WebSocket Events
socket.on('connect', () => {
    console.log('Connected to server');
    updateStatus(true);
    loadNicknames(); // Load nicknames on connect
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateStatus(false);
});

socket.on('feedEvent', (event) => {
    console.log('Received event:', event);
    if (!isPaused) {
        addEvent(event);
    }
});

socket.on('initialFeed', (initialEvents) => {
    console.log('Received initial feed:', initialEvents.length, 'events');
    events = initialEvents;
    loadNicknames(); // Load nicknames
    applyFilters();
});

socket.on('feedCleared', () => {
    console.log('Feed cleared by server');
    events = [];
    eventCountsLastMinute = [];
    updateStats();
    applyFilters();
});

// Update Status
function updateStatus(connected) {
    if (connected) {
        elements.statusDot.classList.remove('disconnected');
        elements.statusText.textContent = 'Connected';
    } else {
        elements.statusDot.classList.add('disconnected');
        elements.statusText.textContent = 'Disconnected';
    }
}

// Add Event
function addEvent(event) {
    events.unshift(event);
    updateStats();
    applyFilters();
}

// Update Stats
function updateStats() {
    elements.totalEvents.textContent = events.length;
}

// Apply Filters
function applyFilters() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const marketFilter = elements.marketFilter.value;
    const sideFilter = elements.sideFilter.value;
    const eventTypeFilter = elements.eventTypeFilter.value;

    filteredEvents = events.filter(event => {
        // Search filter
        if (searchTerm) {
            const matchesName = event.traderName.toLowerCase().includes(searchTerm);
            const matchesAddress = event.traderAddress?.toLowerCase().includes(searchTerm);
            if (!matchesName && !matchesAddress) return false;
        }

        // Market filter
        if (marketFilter) {
            const eventMarket = event.market.split('-')[0];
            if (eventMarket !== marketFilter) return false;
        }

        // Side filter
        if (sideFilter && event.side !== sideFilter) return false;

        // Event type filter
        const isModification = event.previousSize !== undefined && event.newSize !== undefined;
        if (eventTypeFilter === 'trades' && isModification) return false;
        if (eventTypeFilter === 'modifications' && !isModification) return false;

        return true;
    });

    renderFeed();
}

// Render Feed
function renderFeed() {
    if (filteredEvents.length === 0) {
        elements.feedContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-text">No events matching filters</div>
            </div>
        `;
        return;
    }

    elements.feedContainer.innerHTML = filteredEvents.map(event => createEventHTML(event)).join('');
}

// Create Event HTML
function createEventHTML(event) {
    const timeAgo = getTimeAgo(event.ts);
    const market = event.market.split('-')[0];
    
    // Use nickname if available, otherwise use traderName or shortened address
    let displayName = event.traderName;
    if (event.traderAddress && leaderNicknames[event.traderAddress]) {
        displayName = leaderNicknames[event.traderAddress];
    } else if (event.traderAddress) {
        // Check if traderAddress matches any nickname key (case insensitive)
        const matchingKey = Object.keys(leaderNicknames).find(
            key => key.toLowerCase() === event.traderAddress.toLowerCase()
        );
        if (matchingKey) {
            displayName = leaderNicknames[matchingKey];
        }
    }

    // Create HyperDash link if we have trader address
    const traderLink = event.traderAddress 
        ? `https://legacy.hyperdash.com/trader/${event.traderAddress}`
        : '#';
    const traderNameHTML = event.traderAddress
        ? `<a href="${traderLink}" target="_blank" class="trader-name trader-link" title="View on HyperDash">${escapeHtml(displayName)}</a>`
        : `<span class="trader-name">${escapeHtml(displayName)}</span>`;

    // Check if this is a position modification (size change)
    const isModification = event.previousSize !== undefined && event.newSize !== undefined;
    
    let side, dotClass, formattedQty, formattedNotional, positionTypeBadge = '';
    
    if (isModification) {
        // Position size changed - show it like a regular trade
        const sizeDiff = Math.abs(event.newSize - event.previousSize);
        side = event.side === 'buy' ? 'bought' : 'sold';
        dotClass = event.side === 'sell' ? 'sell' : '';
        formattedQty = formatNumberPrecise(sizeDiff);
        formattedNotional = formatCurrency(event.notionalUsd);
        
        // Add SHORT/LONG badge based on side
        positionTypeBadge = event.side === 'sell' 
            ? '<span class="position-type-badge short">SHORT</span>'
            : '<span class="position-type-badge long">LONG</span>';
    } else {
        // Regular buy/sell
        side = event.side === 'buy' ? 'bought' : 'sold';
        dotClass = event.side === 'buy' ? '' : 'sell';
        formattedQty = formatNumberPrecise(event.qty);
        formattedNotional = formatCurrency(event.notionalUsd);
    }

    return `
        <div class="event-item" data-id="${event.id}">
            <div class="event-indicator">
                <div class="event-dot ${dotClass}"></div>
            </div>
            <div class="event-content">
                <div class="event-text">
                    ${traderNameHTML}
                    ${side} <span class="event-amount">${formattedQty}</span> 
                    <span class="event-coin">${market}</span> 
                    for <span class="event-amount">${formattedNotional}</span>
                </div>
                <div class="event-footer">
                    <span class="event-time">${timeAgo}</span>
                    <span class="event-separator">·</span>
                    ${positionTypeBadge}
                    <span class="event-badge badge-perp">Perp</span>
                </div>
            </div>
            <div class="event-sidebar">
                ${event.isPro ? '<span class="badge-pro">Pro</span>' : ''}
            </div>
        </div>
    `;
}

// Time Ago
function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// Format Number
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// Format Number with Precision (for quantities)
function formatNumberPrecise(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(4) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(4) + 'K';
    }
    // Show up to 4 decimals, but remove trailing zeros
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

// Format Currency
function formatCurrency(num) {
    if (num >= 1000000) {
        return '$' + (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return '$' + (num / 1000).toFixed(2) + 'K';
    }
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// Event Listeners
elements.clearBtn.addEventListener('click', async () => {
    if (confirm('Clear all events?')) {
        try {
            const response = await fetch('/api/feed/clear', { method: 'POST' });
            if (response.ok) {
                events = [];
                eventCountsLastMinute = [];
                updateStats();
                applyFilters();
            }
        } catch (error) {
            console.error('Failed to clear feed:', error);
        }
    }
});

elements.searchInput.addEventListener('input', applyFilters);
elements.marketFilter.addEventListener('change', applyFilters);
elements.sideFilter.addEventListener('change', applyFilters);
elements.eventTypeFilter.addEventListener('change', applyFilters);

// Load nicknames from API
async function loadNicknames() {
    try {
        const response = await fetch('/api/leaders');
        const data = await response.json();
        leaderNicknames = data.nicknames || {};
        console.log('Loaded nicknames:', leaderNicknames);
        // Re-render feed with updated nicknames
        renderFeed();
    } catch (error) {
        console.error('Failed to load nicknames:', error);
    }
}

// Modal functionality
elements.manageLeadersBtn.addEventListener('click', () => {
    elements.leadersModal.classList.add('active');
    loadLeaders();
});

elements.closeModal.addEventListener('click', () => {
    elements.leadersModal.classList.remove('active');
});

elements.leadersModal.addEventListener('click', (e) => {
    if (e.target === elements.leadersModal) {
        elements.leadersModal.classList.remove('active');
    }
});

elements.addLeaderBtn.addEventListener('click', async () => {
    const address = elements.newLeaderAddress.value.trim();
    const nickname = elements.newLeaderNickname.value.trim();
    
    if (!address) {
        alert('Please enter a wallet address');
        return;
    }
    
    try {
        const response = await fetch('/api/leaders/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, nickname })
        });
        
        if (response.ok) {
            elements.newLeaderAddress.value = '';
            elements.newLeaderNickname.value = '';
            loadLeaders();
            loadNicknames(); // Reload nicknames to update the feed
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Failed to add leader:', error);
        alert('Failed to add wallet');
    }
});

async function loadLeaders() {
    try {
        const response = await fetch('/api/leaders');
        const data = await response.json();
        
        if (data.leaders.length === 0) {
            elements.leadersList.innerHTML = '<div class="empty-leaders">No wallets configured</div>';
            return;
        }
        
        elements.leadersList.innerHTML = data.leaders.map(address => {
            const nickname = data.nicknames[address] || address.slice(0, 8) + '...';
            return `
                <div class="leader-item">
                    <div class="leader-info">
                        <div class="leader-nickname" id="nickname-${address}">${escapeHtml(nickname)}</div>
                        <div class="leader-address">${escapeHtml(address)}</div>
                    </div>
                    <div class="leader-actions">
                        <button class="btn btn-secondary" onclick="editLeader('${address}')">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-danger" onclick="removeLeader('${address}')">
                            🗑️ Remove
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load leaders:', error);
        elements.leadersList.innerHTML = '<div class="empty-leaders">Failed to load wallets</div>';
    }
}

async function editLeader(address) {
    const nicknameElement = document.getElementById(`nickname-${address}`);
    const currentNickname = nicknameElement.textContent;
    
    const newNickname = prompt(`Edit nickname for ${address}:`, currentNickname);
    
    if (newNickname === null) return; // Cancelled
    
    try {
        const response = await fetch(`/api/leaders/${address}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: newNickname })
        });
        
        if (response.ok) {
            loadLeaders();
            loadNicknames(); // Reload nicknames to update the feed
        } else {
            alert('Failed to update nickname');
        }
    } catch (error) {
        console.error('Failed to update leader:', error);
        alert('Failed to update nickname');
    }
}

async function removeLeader(address) {
    if (!confirm(`Remove wallet ${address}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/leaders/${encodeURIComponent(address)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadLeaders();
            alert('✅ Wallet removed successfully');
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        console.error('Failed to remove leader:', error);
        alert('Failed to remove wallet');
    }
}

// Update only timestamps every 30 seconds (more discreet)
function updateTimestamps() {
    const timeElements = document.querySelectorAll('.event-time');
    timeElements.forEach((element, index) => {
        if (filteredEvents[index]) {
            element.textContent = getTimeAgo(filteredEvents[index].ts);
        }
    });
}

setInterval(() => {
    if (!isPaused && filteredEvents.length > 0) {
        updateTimestamps();
    }
}, 30000);

// Market Search Functionality
const markets = ['BTC', 'ETH', 'SOL', 'HYPE', 'AVAX', 'DOGE', 'SUI', 'kPEPE', 'APT', 'SEI', 'kBONK', 
    'ENA', 'POPCAT', 'EIGEN', 'GOAT', 'MOODENG', 'GRASS', 'VIRTUAL', 'FARTCOIN', 'BERA', 'RESOLV', 
    'ZEC', 'LIT', 'XRP', 'ADA', 'LINK', 'DOT', 'MATIC', 'UNI', 'ATOM', 'LTC', 'BCH', 'NEAR', 'ARB', 
    'OP', 'INJ', 'TIA', 'WLD', 'BLUR', 'MKR', 'FTM', 'RUNE', 'AAVE', 'CRV', 'SNX', 'COMP', 'SUSHI', 
    'WOO', 'GMX', 'PEPE', 'SHIB', 'FLR', 'MEME', 'ORDI', 'JUP', 'PYTH', 'JTO', 'DYM', 'ALT', 'STRK', 
    'W', 'ONDO', 'PENDLE', 'BONK', 'WIF', 'TNSR', 'ETHFI', 'OMNI', 'TON', 'NOT', 'IO', 'ZRO', 'TAO', 
    'TRUMP', 'MEW', 'MOTHER', 'LISTA'];

let currentMarketFilter = '';

function showMarketDropdown(filteredMarkets) {
    elements.marketDropdown.innerHTML = '';
    
    // Add "All Markets" option
    const allOption = document.createElement('div');
    allOption.className = 'market-dropdown-item' + (currentMarketFilter === '' ? ' selected' : '');
    allOption.textContent = 'All Markets';
    allOption.onclick = () => selectMarket('');
    elements.marketDropdown.appendChild(allOption);
    
    // Add filtered markets
    filteredMarkets.forEach(market => {
        const item = document.createElement('div');
        item.className = 'market-dropdown-item' + (currentMarketFilter === market ? ' selected' : '');
        item.textContent = market;
        item.onclick = () => selectMarket(market);
        elements.marketDropdown.appendChild(item);
    });
    
    elements.marketDropdown.classList.add('show');
}

function selectMarket(market) {
    currentMarketFilter = market;
    elements.marketFilter.value = market;
    elements.marketSearch.value = market || 'All Markets';
    elements.marketDropdown.classList.remove('show');
    applyFilters();
}

elements.marketSearch.addEventListener('focus', () => {
    const searchTerm = elements.marketSearch.value.toLowerCase();
    const filtered = searchTerm && searchTerm !== 'all markets'
        ? markets.filter(m => m.toLowerCase().includes(searchTerm))
        : markets;
    showMarketDropdown(filtered);
});

elements.marketSearch.addEventListener('input', () => {
    const searchTerm = elements.marketSearch.value.toLowerCase();
    if (searchTerm === '' || searchTerm === 'all markets') {
        showMarketDropdown(markets);
    } else {
        const filtered = markets.filter(m => m.toLowerCase().includes(searchTerm));
        showMarketDropdown(filtered);
    }
});

elements.marketSearch.addEventListener('blur', (e) => {
    setTimeout(() => {
        elements.marketDropdown.classList.remove('show');
    }, 200);
});

console.log('Live Feed loaded');

