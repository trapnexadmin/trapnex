# MongoDB Integration Guide

## 📊 Database Setup

Trapnex uses MongoDB to store all trading data including candles, signals, trades, market data, and caching for offline viewing.

### Installation

#### Option 1: MongoDB Community Edition (Local)

**Windows:**
1. Download from: https://www.mongodb.com/try/download/community
2. Run installer and follow default settings
3. MongoDB will run as a Windows service automatically
4. Default connection: `mongodb://localhost:27017`

**Linux/Mac:**
```bash
# Using Homebrew (Mac)
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Using apt (Ubuntu/Debian)
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

#### Option 2: MongoDB Atlas (Cloud - Free Tier)

1. Sign up at: https://www.mongodb.com/cloud/atlas/register
2. Create a free cluster (M0)
3. Whitelist your IP address (0.0.0.0/0 for testing)
4. Create database user
5. Get connection string

### Configuration

Add MongoDB connection to `.env`:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/trapnex

# For MongoDB Atlas (Cloud)
# MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/trapnex?retryWrites=true&w=majority
```

### Database Schema

#### Collections

1. **candles** - OHLCV candle data
   - Indexes: `symbol`, `timeframe`, `time`
   - Stores: 1m, 3m, 5m, 15m candles
   - Auto-cleanup: Keep last 30 days

2. **market_data** - Daily market levels
   - CPR levels (Pivot, TC, BC)
   - Support/Resistance (R1-R6, S1-S6)
   - Previous day HLC
   - ATR and bias

3. **signals** - Trading signals
   - Entry, Stop Loss, Target
   - Risk/Reward ratio
   - Analysis data (CPR, AM, scoring)
   - Strike prices

4. **trades** - Executed trades
   - Entry/Exit details
   - P&L tracking
   - Trade duration
   - Performance metrics

5. **cache** - Offline caching
   - Full state snapshots
   - TTL-based expiration
   - Auto-cleanup

### Database Operations

#### Automatic Data Persistence

The system automatically saves:
- ✅ Historical candles on load
- ✅ New candles every 5 minutes
- ✅ Market data (CPR, S/R) on analysis
- ✅ Signals when generated
- ✅ Trades when opened/closed
- ✅ Full state cache every 30 seconds

#### Manual Database Queries

Using MongoDB Compass or CLI:

```javascript
// Get today's signals
db.signals.find({ 
  timestamp: { 
    $gte: new Date(new Date().setHours(0,0,0,0)) 
  } 
}).sort({ timestamp: -1 })

// Get trade statistics
db.trades.aggregate([
  { $match: { status: 'CLOSED' } },
  { $group: {
    _id: null,
    totalTrades: { $sum: 1 },
    winners: { 
      $sum: { $cond: [{ $gt: ['$pnl.points', 0] }, 1, 0] }
    },
    totalPnL: { $sum: '$pnl.points' }
  }}
])

// Get candles for specific timeframe
db.candles.find({
  symbol: 'NIFTY50',
  timeframe: '5m',
  time: {
    $gte: new Date('2026-06-08T09:15:00'),
    $lte: new Date('2026-06-08T15:30:00')
  }
}).sort({ time: 1 })
```

### API Endpoints for Database

#### Get Cached State (for offline viewing)
```
GET /api/state/cached
```

#### Get Historical Candles
```
GET /api/db/candles/:timeframe?start=2026-06-08&end=2026-06-09
```

#### Get Recent Signals
```
GET /api/db/signals?limit=10
```

#### Get Trades & Stats
```
GET /api/db/trades?limit=20
```

#### Get Market Data (CPR, S/R)
```
GET /api/db/market-data
```

### Offline Mode

When backend is offline, frontend automatically:
1. ✅ Loads cached state from localStorage
2. ✅ Falls back to API cached data
3. ✅ Shows last known data (up to 24 hours old)
4. ✅ Displays "OFFLINE" status indicator

### Database Maintenance

#### Indexes
All necessary indexes are created automatically on startup.

#### Cleanup
Remove old candles (older than 30 days):
```javascript
db.candles.deleteMany({
  time: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
})
```

#### Backup
```bash
# Backup database
mongodump --db trapnex --out ./backup

# Restore database
mongorestore --db trapnex ./backup/trapnex
```

### Graceful Degradation

If MongoDB is unavailable:
- ✅ System continues to work
- ✅ Real-time data still flows
- ✅ Frontend uses cached data
- ⚠️ Data won't persist
- 📝 Logs: "Continuing without database"

### Monitoring

Check connection status:
```bash
# View logs
tail -f logs/trapnex.log

# MongoDB connection logs
[MongoDB] ✓ Connected successfully
[MongoDB] Database: trapnex
```

### Troubleshooting

**Connection Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
Solution: Start MongoDB service
```bash
# Windows
net start MongoDB

# Linux
sudo systemctl start mongod

# Mac
brew services start mongodb-community
```

**Authentication Error:**
```
Error: Authentication failed
```
Solution: Check username/password in MONGODB_URI

**No data persisting:**
- Check MongoDB is running
- Check logs for "[MongoDB] ✓ Connected"
- Verify MONGODB_URI in .env

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start MongoDB (if local)
# Windows: Already running as service
# Linux/Mac: sudo systemctl start mongod

# 3. Configure .env
MONGODB_URI=mongodb://localhost:27017/trapnex

# 4. Start backend
npm start

# You should see:
[MongoDB] ✓ Connected successfully
[MongoDB] Database: trapnex
```

Data is now being saved and can survive backend restarts! 🎉
