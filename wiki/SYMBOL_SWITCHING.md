# Symbol Switching Feature

## Overview
Added the ability to switch between different market instruments (Nifty, Sensex, Crude Oil) in real-time without restarting the server.

## Features
- **Symbol Dropdown**: Located in the top center of the header
- **Supported Symbols**:
  - **NIFTY 50** (NSE) - Token: 99926000
  - **SENSEX** (BSE) - Token: 99919000
  - **CRUDE OIL** (MCX) - Token: 260105

## Implementation Details

### Frontend Changes

#### 1. Header Component (`frontend/src/components/Header.jsx`)
- Added symbol dropdown with animated menu
- Shows current selected symbol
- Displays exchange name (NSE/BSE/MCX)
- Triggers `onSymbolChange` callback when selection changes

#### 2. App Component (`frontend/src/App.jsx`)
- Added `handleSymbolChange` function
- Sends `CHANGE_SYMBOL` message to backend via WebSocket
- Message format:
  ```javascript
  {
    type: 'CHANGE_SYMBOL',
    data: {
      symbol: 'NIFTY',      // Symbol identifier
      token: '99926000',    // Instrument token
      exchange: 'NSE',      // Exchange name
      label: 'NIFTY 50'     // Display label
    }
  }
  ```

### Backend Changes

#### 1. Environment Variables (`.env`)
```env
# Instrument Tokens for different symbols
ANGELONE_INSTRUMENT_TOKEN=99926000
ANGELONE_INSTRUMENT_TOKEN_NIFTY=99926000
ANGELONE_INSTRUMENT_TOKEN_SENSEX=99919000
ANGELONE_INSTRUMENT_TOKEN_CRUDEOIL=260105
```

#### 2. AngelOne Feed (`backend/src/websocket/angeloneFeed.js`)

**New Methods:**

- **`unsubscribe()`**: Unsubscribes from current instrument
  - Sends action: 0 (Unsubscribe) to WebSocket
  
- **`changeInstrument(newToken, exchange)`**: Changes to new instrument
  - Unsubscribes from current symbol
  - Updates instrument token
  - Subscribes to new symbol
  - Loads new historical candles
  - Fetches new previous day HLC
  - Returns `true` on success, `false` on failure
  - Automatically rolls back on error

#### 3. Server Index (`backend/src/index.js`)

**Changes:**
- Added `liveFeed` global variable to store feed reference
- Added WebSocket message handler for `CHANGE_SYMBOL`
- Calls `liveFeed.changeInstrument()` when symbol change requested
- Broadcasts `SYMBOL_CHANGED` event to all clients on success
- Returns error message if symbol change fails or not supported (demo mode)

## Usage

### Frontend
1. Click the symbol dropdown in the header (next to the price)
2. Select a new symbol (Nifty, Sensex, or Crude Oil)
3. The system will automatically:
   - Unsubscribe from the old symbol
   - Subscribe to the new symbol
   - Load historical data for the new symbol
   - Start receiving live ticks for the new symbol

### Backend WebSocket Flow

```
Client                          Server
  |                               |
  |-- CHANGE_SYMBOL message -->   |
  |                               |
  |                          Unsubscribe old
  |                          Subscribe new
  |                          Load history
  |                               |
  |<-- SYMBOL_CHANGED event ----  |
  |<-- INIT with new data ------  |
  |<-- TICK messages ---------->  |
```

## Demo Mode Limitation
- Symbol switching is **only available in Live Mode** (AngelOne/Upstox/Zerodha)
- In Demo Mode, symbol change requests return an error message
- Demo mode uses simulated data for a single instrument

## Error Handling
- If symbol change fails, the system automatically rolls back to the previous symbol
- Clients receive an error message via WebSocket
- Console logs show detailed error information

## Testing

### Test Symbol Change:
1. Start the backend server with AngelOne credentials
2. Open the frontend
3. Wait for connection to establish
4. Click the symbol dropdown
5. Select a different symbol
6. Verify:
   - Price updates to new symbol
   - Chart reloads with new symbol's candles
   - CPR levels recalculate for new symbol
   - Signals generate for new symbol

### Expected Console Output (Backend):
```
[AngelOneFeed] Unsubscribing from instrument: 99926000
[AngelOneFeed] Unsubscribed successfully
[AngelOneFeed] Changing instrument from 99926000 to 99919000
[AngelOneFeed] Subscribing to instrument: 99919000
[AngelOneFeed] Subscribed successfully
[AngelOneFeed] Loading historical candles...
[AngelOneFeed] ✓ Successfully switched to instrument 99919000
[WS] ✓ Symbol changed to SENSEX
```

### Expected Console Output (Frontend):
```
[App] Symbol changed: {value: 'SENSEX', token: '99919000', exchange: 'BSE', label: 'SENSEX'}
[App] Symbol change request sent to backend
```

## Future Enhancements
- Add more instruments (BankNifty, FinNifty, etc.)
- Save user's last selected symbol in localStorage
- Show symbol-specific information (lot size, margin)
- Add symbol search functionality
- Support custom instrument tokens
