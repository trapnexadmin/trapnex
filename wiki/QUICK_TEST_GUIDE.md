# 🎯 Quick Test Guide

## 🚀 Immediate Testing Steps

### Step 1: Install Dependencies
```bash
cd backend
npm install
# This installs mongoose for MongoDB
```

### Step 2: Start MongoDB
**Windows:** Already running as service (if installed)

**Mac/Linux:**
```bash
# Mac
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

**Or use MongoDB Atlas** (cloud - free tier):
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/trapnex
```

### Step 3: Start Backend
```bash
cd backend
npm start
```

**Expected Output:**
```
[MongoDB] ✓ Connected successfully
[MongoDB] Database: trapnex
Server listening on port 3001
WebSocket server running
```

### Step 4: Start Frontend
```bash
cd frontend
npm run dev
```

---

## ✅ Feature Tests

### Test 1: Seconds Display ⏰
**Goal:** Verify time axis shows seconds

1. Open frontend
2. Look at chart bottom axis
3. **Expected:** Time shows as `09:15:00`, `09:15:05`, `09:15:10` (with seconds)

### Test 2: Volume Display 📊
**Goal:** Verify volume bars visible

1. Look at bottom of chart
2. **Expected:** Green/red bars below candles (50% opacity)
3. Bars should be clearly visible, not transparent

### Test 3: CPR Levels 🎯
**Goal:** Verify CPR lines showing

1. Wait for "Previous Day HLC loaded" in backend logs
2. Wait for strategy analysis
3. **Expected:** Three lines visible:
   - Blue line: Pivot (P)
   - Purple lines: TC and BC

### Test 4: Support/Resistance Levels 📈
**Goal:** Verify all S/R levels showing

1. After CPR loads
2. **Expected:** 13 lines total:
   - R6, R5, R4, R3, R2, R1 (above pivot, red shades)
   - PP (pivot point, blue)
   - S1, S2, S3, S4, S5, S6 (below pivot, green/blue shades)

### Test 5: Data Persistence 💾
**Goal:** Verify data survives restart

1. Start backend, wait 5+ minutes for candles
2. Backend logs: "Saved X candles to database"
3. Stop backend (`Ctrl+C`)
4. Start backend again
5. **Expected:** Data reloads from database, no loss

### Test 6: Offline Mode 📴
**Goal:** Verify frontend works without backend

1. Load frontend with backend running
2. Wait 30+ seconds (for cache)
3. Stop backend
4. Refresh frontend page
5. **Expected:** 
   - Shows cached data (candles, CPR, S/R)
   - Console: "[Cache] Loaded cached state"
   - Connection indicator shows offline

### Test 7: API Endpoints 🔌
**Goal:** Verify database API working

```bash
# Test cached state
curl http://localhost:3001/api/state/cached

# Test candles
curl http://localhost:3001/api/db/candles/5m

# Test signals
curl http://localhost:3001/api/db/signals?limit=5

# Test market data
curl http://localhost:3001/api/db/market-data
```

### Test 8: MongoDB Data 🗄️
**Goal:** View stored data directly

**Using MongoDB Compass** (GUI):
1. Download: https://www.mongodb.com/try/download/compass
2. Connect to: `mongodb://localhost:27017`
3. Select database: `trapnex`
4. Browse collections: candles, signals, trades, market_data, cache

**Using CLI:**
```bash
mongosh
use trapnex
db.candles.find().limit(5)
db.market_data.find()
db.signals.find()
```

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to MongoDB"
**Solution:**
```bash
# Check MongoDB status
# Windows
net start MongoDB

# Mac
brew services list | grep mongo

# Linux
sudo systemctl status mongod
```

### Issue: "Seconds not showing"
**Check:**
- Browser cache cleared?
- Frontend rebuilt? (`npm run dev`)
- Chart config has `secondsVisible: true` ✅ (already set)

### Issue: "Volume not visible"
**Check:**
- Volume data in candles? (backend logs should show volume values)
- Chart opacity: 0.5 ✅ (already set)
- Volume scale margins ✅ (already set)

### Issue: "CPR/S-R not showing"
**Check:**
- Backend logs: "Previous Day HLC set"?
- Backend logs: "Analysis complete" with CPR values?
- Frontend receiving analysis data? (check browser console)

### Issue: "Data not persisting"
**Check:**
- MongoDB connected? (backend logs)
- Wait 5 minutes for first auto-save
- Check database: `db.candles.count()`

---

## 📊 Expected Backend Logs

### Successful Startup
```
[MongoDB] ✓ Connected successfully
[MongoDB] Database: trapnex
Server listening on port 3001
WebSocket server running
[AngelOne] Connecting...
[AngelOne] ✓ Connected
[AngelOne] Subscribing to NIFTY50
[Candles] Fetching historical candles...
[Candles] Previous Day HLC set: { high: 23516.35, low: 23282.65, close: 23366.7 }
[Candles] Built 3m candles: 100 from 300 1m candles
[Candles] Built 5m candles: 60 from 300 1m candles
[Candles] Built 15m candles: 20 from 300 1m candles
[DB] Saved 300 1m candles to database
[DB] Saved 100 3m candles to database
[DB] Saved 60 5m candles to database
[DB] Saved 20 15m candles to database
[Strategy] Running analysis...
[Strategy] Analysis complete:
  CPR: P=23388.57, TC=23455.15, BC=23322.00, Width=133.15 (NARROW)
  Bias: BULLISH
  S/R: R1=23514.14, R2=23641.92, ..., S1=23262.79, S2=23135.01, ...
[DB] Saved market data (CPR, S/R) to database
```

### Periodic Operations
```
[5 min] Saving candles to database...
[DB] Saved 5 new candles for each timeframe
[30 sec] Caching full state...
[Cache] Cached state (valid for 1 hour)
```

---

## 🎉 Success Indicators

✅ **MongoDB Connected** - Backend logs show connection
✅ **Candles Loading** - 1m/3m/5m/15m data available
✅ **Previous Day HLC** - Backend logs show values
✅ **CPR Calculated** - Backend shows P, TC, BC
✅ **S/R Calculated** - Backend shows R1-R6, S1-S6
✅ **Frontend Chart** - Shows candles with time/seconds
✅ **Volume Visible** - Green/red bars at bottom
✅ **CPR Lines** - Blue and purple lines visible
✅ **S/R Lines** - 13 levels visible
✅ **Data Persists** - Survives backend restart
✅ **Offline Works** - Frontend loads cached data

---

## 📱 Contact Points

### Backend Health
```
http://localhost:3001/api/health
```

### WebSocket Connection
```
ws://localhost:3001/ws
```

### Frontend
```
http://localhost:5173
```

---

## ⚡ Quick Verification

**One-command test:**
```bash
# In backend directory
npm install && npm start

# Expected:
# - MongoDB connects ✅
# - AngelOne connects ✅
# - Historical data loads ✅
# - Analysis runs ✅
# - Data saves to DB ✅
```

**Check database:**
```bash
mongosh trapnex --eval "db.stats()"
# Should show database with collections
```

**Check frontend:**
1. Open http://localhost:5173
2. Press F12 (dev tools)
3. Check console for WebSocket connection
4. Check Network tab for `/ws` connection

---

## 🎯 What You Should See

### Frontend Chart
- ✅ Candlesticks (green/red)
- ✅ Volume bars (green/red, bottom)
- ✅ Time axis with seconds
- ✅ CPR lines (3 lines)
- ✅ S/R lines (13 lines total)
- ✅ Timeframe tabs (1m/3m/5m/15m)

### Backend Console
- ✅ MongoDB connection message
- ✅ AngelOne connection message
- ✅ Historical data loading
- ✅ CPR/S-R calculations
- ✅ Periodic data saving

### MongoDB Database
- ✅ `candles` collection (thousands of documents)
- ✅ `market_data` collection (daily data)
- ✅ `cache` collection (state snapshots)
- ✅ `signals` collection (when generated)
- ✅ `trades` collection (when executed)

---

All systems ready for testing! 🚀
