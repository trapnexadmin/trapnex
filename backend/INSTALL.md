# Quick Installation Guide

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

This will install all required packages including:
- `smartapi-javascript` - AngelOne/SmartAPI SDK
- `kiteconnect` - Zerodha/Kite Connect SDK
- `ws` - WebSocket for Upstox
- Other core dependencies

## Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` and configure your broker:

### For AngelOne (Recommended - Primary)
```env
MARKET_PLATFORM=angelone
ANGELONE_API_KEY=your_api_key
ANGELONE_CLIENT_ID=your_client_id
ANGELONE_PASSWORD=your_password
```

### For Upstox
```env
MARKET_PLATFORM=upstox
UPSTOX_ACCESS_TOKEN=your_access_token
```

### For Zerodha
```env
MARKET_PLATFORM=zerodha
ZERODHA_API_KEY=your_api_key
ZERODHA_ACCESS_TOKEN=your_access_token
```

## Step 3: Run the Application

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Step 4: Verify Connection

The server will display:
```
╔══════════════════════════════════════╗
║         TRAPNEX Trading Engine       ║
║     AM + CPR Strategy Platform       ║
╠══════════════════════════════════════╣
║  HTTP:  http://localhost:3001        ║
║  WS:    ws://localhost:3001/ws       ║
║  Platform: ANGELONE                  ║
╚══════════════════════════════════════╝

[Mode] Live (ANGELONE WebSocket)
[AngelOneFeed] Authentication successful
[AngelOneFeed] Connected
```

## Demo Mode

If no credentials are configured, the system runs in **Demo Mode**:
```
[Mode] Demo (Simulated Data)
[Demo] Starting demo mode with simulated data...
```

This is perfect for:
- Testing the platform
- Strategy development
- Understanding the UI
- Training purposes

## Troubleshooting

### Dependencies Not Installing

If you see errors during `npm install`:

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Platform Connection Failed

**AngelOne:**
- Verify API key is correct
- Check client ID format (e.g., "A12345")
- Ensure password is your trading password
- Check if 2FA/TOTP is required

**Upstox:**
- Access token expires in 24 hours - regenerate daily
- Verify the token is not expired

**Zerodha:**
- Ensure you have an active Kite Connect subscription (₹2000/month)
- Access token expires at 6 AM daily

### Port Already in Use

```bash
# Change port in .env
PORT=3002
```

Or kill the process using port 3001:

**Windows:**
```bash
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
lsof -ti:3001 | xargs kill -9
```

## Next Steps

1. Start the frontend application (see frontend/README.md)
2. Configure trading parameters
3. Monitor live market data
4. Review trade signals and scoring
5. Track PnL in real-time

## Support

For detailed platform-specific setup, see [PLATFORM_SETUP.md](../PLATFORM_SETUP.md)

For issues, create a GitHub issue with:
- Platform being used
- Error logs
- Environment details
