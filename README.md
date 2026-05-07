# Arduino Boss Battle

A multiplayer "boss battle" web game where each kid has a physical Arduino station. The boss attacks players (LED on + buzzer beep on their Arduino), and the player must press their button to block. A teacher creates a 5-digit lobby code, kids join with a name, and the room plays together. Built with [HotStaq](https://www.hotstaq.com/) for the backend, HotStaq templates (`.hott`) for the frontend, and the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) so each player's browser talks directly to their own Arduino.

The server holds game state in memory only and never touches a serial port — all Arduino I/O happens client-side.

## What's in here

```
arduinoboss/
├── arduino/ArduinoBoss/ArduinoBoss.ino   Sketch for each station
├── public/                                Frontend (HotStaq templates)
│   ├── index.hott                         Enter code, pick a name
│   ├── lobby.hott                         Waiting room
│   ├── game.hott                          Connect Arduino, play
│   ├── teacher.hott                       Teacher console (create lobby, manage room)
│   ├── spectator.hott                     Read-only big-screen view
│   ├── test.hott                          Wiring sanity check (no lobby needed)
│   ├── css/app.css
│   └── js/                                serial.js, boss-svg.js, emoji.js, ws.js,
│                                          per-page scripts, generated api.js
├── src/                                   TypeScript backend
│   ├── AppAPI.ts                          HotStaq API container + WebSocket bridge
│   ├── GameRoute.ts                       /v1/game/* HTTP endpoints
│   └── GameState.ts                       In-memory Lobby + LobbyManager
├── HotSite.json                           HotStaq config
└── Dockerfile                             Single-image build for deployment
```

State is in-memory only — restarting the server clears every lobby.

## Run locally

Requires Node.js 20+.

```bash
npm install                # only the first time
npm run build              # transpile TypeScript -> ./build
npm run develop            # dev server on http://127.0.0.1:8080
```

Or production-ish (single port, no dev tooling):

```bash
npm run build && npm run build-web
npm run start              # http://127.0.0.1:8080
```

Or in Docker:

```bash
docker build -t arduinoboss .
docker run --rm -p 8080:8080 arduinoboss
```

`npm run develop` regenerates the browser API client (`public/js/api.js`) automatically. `npm run start` does not — run `npm run build-web` after any change to `src/GameRoute.ts` if you go straight to `start`.

## How a session works

1. **Teacher** opens `/teacher.hott`, clicks "Create Lobby". The server returns a 5-digit code and a per-lobby `teacherToken` (UUID). The token is shown once and remembered in browser storage; it's required for every teacher-only action on that lobby.
2. **Players** open `/`, type the lobby code, pick a name from the approved list, then go to `/game.hott` and click "Connect Arduino" to grant Web Serial access to their station's port.
3. **Teacher** clicks "Start Game". The server runs a 3-second countdown, then begins the boss fight.
4. **Spectator** view (`/spectator.hott`) shows the same lobby on a big screen with no controls.

Each lobby is independent. Teachers cannot see or control other teachers' lobbies — the `teacherToken` scopes everything.

## Flash the Arduino

1. Open `arduino/ArduinoBoss/ArduinoBoss.ino` in the Arduino IDE.
2. Tools → Board → "Arduino Nano".
3. Tools → Processor → "ATmega328P (Old Bootloader)" (the CH340 clones almost always need this).
4. Tools → Port → pick the `/dev/ttyUSB*` (Linux), `COM*` (Windows), or `/dev/cu.usbserial-*` (macOS) port for your Nano.
5. Click Upload.

Wiring (per station):

| Component | Arduino pin | Notes |
| --- | --- | --- |
| Tactile button | D2 → GND | `INPUT_PULLUP`, pressed = LOW |
| LED + 220 Ω resistor | D13 → resistor → GND | D13 also lights the onboard LED |
| Passive piezo buzzer | D8 → GND | driven with `tone()` |
| Slide switch (optional) | D4 → GND | currently logged to serial only |

To verify a station without joining a lobby, open `/test.hott` and connect — it exposes raw LED/BUZZ controls and shows incoming events.

## Serial protocol

Both directions are line-delimited (`\n`) ASCII at **9600 baud**.

**Browser → Arduino**

| Command | Effect |
| --- | --- |
| `LED:ON` | Turn LED on |
| `LED:OFF` | Turn LED off; cancels any active `ATTACK` |
| `BUZZ:<freq>` | Play tone at given Hz (e.g. `BUZZ:1000`) |
| `BUZZ:OFF` | Stop tone |
| `ATTACK:<ms>` | LED on + 880 Hz tone for that many milliseconds |
| `PING` | Replies `PONG` |

**Arduino → Browser**

| Event | Meaning |
| --- | --- |
| `READY` | Sent once at boot |
| `BTN:PRESS` / `BTN:RELEASE` | Tactile button changed (debounced) |
| `SW:UP` / `SW:DOWN` | Slide switch changed (debounced) |

## HTTP API

All endpoints are POST `application/json` under `/v1/game/`. Every call takes a `code` (5-digit lobby code). Teacher-only endpoints additionally take `teacherToken`, returned once from `create_lobby`.

**Lobby management**

| Path | Body | Returns |
| --- | --- | --- |
| `create_lobby` | `{}` | `{code, teacherToken}` |
| `delete_lobby` | `{code, teacherToken}` | `{ok:true}` |
| `list_lobbies` | `{}` | `{lobbies:[{code, phase, playerCount, approvedNameCount}]}` |
| `lobby_state` | `{code}` | `PublicLobbyState` |
| `lobby_detail` | `{code, teacherToken}` | full state including per-player difficulty |

**Player actions**

| Path | Body | Returns |
| --- | --- | --- |
| `list_names` | `{code}` | `[{name, taken}]` |
| `join` | `{code, name}` | `Player` |
| `leave` | `{code, name}` | `{ok:true}` |
| `report_hit` | `{code, name, attackId}` | `{ok, reason?}` |
| `report_miss` | `{code, name, attackId}` | `{ok}` |
| `report_early_press` | `{code, name}` | `{damaged:boolean}` (penalizes only on hard difficulty) |
| `set_arduino_status` | `{code, name, connected}` | `{ok:true}` |
| `send_emoji` | `{code, name, emoji}` | `{ok:true}` |

**Teacher-only**

| Path | Body | Returns |
| --- | --- | --- |
| `add_name` | `{code, teacherToken, name}` | `{ok:true}` |
| `remove_name` | `{code, teacherToken, name}` | `{ok:true}` |
| `start_game` | `{code, teacherToken}` | `{ok:true}` |
| `reset_game` | `{code, teacherToken}` | `{ok:true}` (5-second countdown, then back to lobby) |
| `revive_player` | `{code, teacherToken, name}` | `{ok:true}` |
| `set_player_paused` | `{code, teacherToken, name, paused}` | `{ok:true}` |
| `set_block_button` | `{code, teacherToken, name, enabled}` | `{ok:true}` (on-screen Block button for kids without a working station) |
| `set_player_difficulty` | `{code, teacherToken, name, difficulty}` | `{ok:true}` (`easy` / `normal` / `hard`) |
| `send_message` | `{code, teacherToken, text}` | `{ok:true}` |
| `set_pranks_enabled` | `{code, teacherToken, enabled}` | `{ok:true}` |

**Pranks (only when teacher enabled)**

| Path | Body | Returns |
| --- | --- | --- |
| `pranks_enabled` | `{code}` | `{enabled}` |
| `prank` | `{code, from, target, freq, durationMs}` | `{ok, reason?}` (freq clamped 100–3000 Hz, duration 100–2000 ms) |

## How the game flow works

1. **State distribution.** The server pushes lobby state over WebSockets — players connect tagged `lobby:<code>`, teachers tagged `teacher`. Clients can also fall back to polling `lobby_state` if needed.
2. **Attack loop.** When a game is `playing`, the server picks a target every ~0.8–2.2 s. Targeting is round-robin: every eligible player is hit once before anyone is hit twice. Eligibility excludes paused, defeated, and briefly-immune players.
3. **Defense.** When a player sees their own name as the current target, their browser sends `LED:ON` + `BUZZ:900` to their Arduino and starts a defense timer. Pressing the button sends `BTN:PRESS` → browser calls `report_hit` → boss HP drops by 1 and the player's score goes up. Missing the timer calls `report_miss` and the player loses 1 HP.
4. **Difficulty.** On `hard`, pressing the button when there's no attack on you costs you 1 HP (`report_early_press`). On `normal` and `easy`, an early press is harmless. Difficulty is per-player and never shown to other players.
5. **End conditions.** Boss HP → 0 = `victory`. All non-waiting players at 0 HP = `defeat`. Teacher can `revive_player` mid-fight, which un-defeats and resumes play if needed.
6. **Reset.** `reset_game` runs a 5-second countdown, restores boss + player HP, promotes any waiting players who joined mid-game, and returns to `lobby` phase.

The backend never talks to the Arduinos. All serial I/O happens inside each player's browser.

## Deploying with HTTPS

Web Serial requires a secure context, so the site must be served over HTTPS in production (`http://127.0.0.1` is treated as secure for local development only).

Typical setup:

1. `docker build -t arduinoboss .` (or `npm run build && npm run build-web && npm run start`)
2. Put it behind a TLS-terminating reverse proxy.

Caddy one-liner:

```caddyfile
boss.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

For local LAN testing without a public domain, use the Chrome flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and add `http://<your-LAN-ip>:8080` — only for development; do not ship this.

## Browser support

| Browser | Web Serial | Works? |
| --- | --- | --- |
| Chrome (desktop) | ✅ | yes |
| Edge (desktop) | ✅ | yes |
| Firefox | ❌ | game UI works, Arduino does not |
| Safari | ❌ | same |

The teacher console and spectator views work in any modern browser since they don't touch Web Serial.

## Troubleshooting

* **"Web Serial not supported"** — open in Chrome or Edge desktop, on https:// (or http://127.0.0.1).
* **No port appears in the picker** — install the CH340 driver. Modern Windows 11 and macOS pull it down automatically; older systems may need [WCH's CH340 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html).
* **Upload fails in Arduino IDE** — the Nano clones almost always need "ATmega328P (Old Bootloader)".
* **Buzzer is silent but LED works** — the buzzer must be a *passive* piezo; active buzzers ignore `tone()`.
* **"Lobby not found"** — codes are ephemeral. Restarting the server (or `delete_lobby`) wipes them; the teacher needs to create a new one.
* **Teacher console says "not authorized"** — the `teacherToken` is per-lobby and stored in that browser only. If the teacher cleared storage or moved devices, they'll need to create a fresh lobby.
