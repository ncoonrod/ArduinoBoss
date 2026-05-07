# CLAUDE.md

Guidance for Claude when working in this repo. Read alongside `README.md`, but where they disagree, **this file is current and the README has drifted.**

## What the README gets wrong

The README describes an older single-lobby version of the app. The actual code:

- Is **multi-lobby**. Every endpoint takes a `code` (5-digit lobby code) parameter. There is no global lobby.
- Uses **per-lobby `teacherToken`** (UUID, returned once from `create_lobby`) for teacher-only endpoints. **There is no `ADMIN_TOKEN` env var and no `kidsboss` default** — that wiring does not exist in the code.
- Has more endpoints than the README lists: pranks, emoji, teacher broadcast messages, per-player pause/difficulty/block-button, revive, spectator support. See `src/GameRoute.ts` for the full list.
- Pages live in `public/*.hott` (HotStaq templates), **not raw `.html`**. Pages: `index`, `lobby`, `game`, `teacher`, `spectator`, `test`.
- State is pushed over **WebSockets** in addition to HTTP polling (see `AppAPI.wireWebSockets`).

If you change endpoints or admin auth, update the README to match — don't keep adding to the drift.

## Architecture rule (don't break this)

**The backend never talks to Arduinos.** All serial I/O happens in the player's browser via the Web Serial API (`public/js/serial.js`). The server only knows about game state. When a feature needs to do something on a player's Arduino (e.g. a prank), the server emits a WebSocket event tagged to that lobby and the target's browser forwards it to their own serial port.

This is why the prank flow is `client → POST /prank → server → WS event → target client → Web Serial`, not `server → serial`.

## How the pieces fit together

- `src/GameState.ts` — `Lobby` (game state machine, attack scheduler) and `LobbyManager` (singleton, EventEmitter for `lobby:state`, `lobbies:list`, `lobby:gone`, `lobby:emoji`, `lobby:message`, `lobby:prank`).
- `src/GameRoute.ts` — HTTP endpoints. Every handler calls `LobbyManager.instance().getLobby(code)`. Teacher-only handlers call `lobby.checkTeacher(teacherToken)` first.
- `src/AppAPI.ts` — wires the route and the WebSocket bridge that fans `LobbyManager` events out to tagged WS clients.
- `public/js/api.js` — generated client (`npm run build-web`); do not hand-edit.
- `public/js/serial.js` and `public/js/boss-svg.js` — hand-written frontend.
- `arduino/ArduinoBoss/ArduinoBoss.ino` — Arduino sketch. Serial protocol is in the README and is current.

State is **in-memory only**. Restarting the server clears all lobbies. `LobbyManager` is a process-wide singleton — do not assume horizontal scaling will work.

## HotStaq quirks worth knowing

- **Two-step build.** `npm run build` transpiles TypeScript to `./build`. `npm run build-web` then runs the built CLI to generate `public/js/api.js` from the route definitions. Run both after changing routes or interfaces. `npm run develop` does this for you in dev mode; `npm run start` does not.
- **WebSocket wiring is deferred.** `httpServer.websocketServer` is created during `HotHTTPServer.listen()`, which happens *after* `onPostRegister` returns. `AppAPI.ts` uses `setImmediate(() => this.wireWebSockets())` to defer wiring until the next tick. If you move that wiring earlier, `wsServer` will be undefined.
- **Custom `onServerAuthorize`.** HotStaq rejects WS auth that has no callback. We override `onServerAuthorize` to just return the auth payload so clients can connect with `{ tag, name }` and nothing else.
- **WS client tagging.** Players connect with `tag: "lobby:<code>"`, teachers with `tag: "teacher"`. `safeSend(tag, event, data)` only sends if there are clients with that tag. If you add a new server-pushed event, follow this pattern — don't broadcast to all clients.
- **Single port.** Dev and prod both run API + web on port 8080 (`--api-http-port 8080 --web-http-port 8080`).

## Game-state invariants — break carefully

- **Every state mutation that clients should re-render on must bump `lastEventId` and call `emitChange()`.** Some of the simple setters skip the bump if the value didn't actually change — preserve that, it prevents redraw storms.
- **Difficulty is hidden from the public state.** `Lobby.publicState()` strips `difficulty` per-player via destructuring before returning. If you add another teacher-only field, strip it the same way.
- **Round-robin attack targeting.** `pickNextTarget()` uses a shuffled `targetQueue` so every eligible player is hit once before anyone is hit twice. Eligibility = not waiting, `hp > 0`, not paused, not immune. If you change targeting rules, update both `pickNextTarget()` and the eligibility check at the top of `launchAttack()` together — they must agree.
- **Phase machine:** `lobby → starting → playing → (victory|defeat) → resetting → lobby`. `starting` and `resetting` have fixed countdowns (3s and 5s). Players who join during a non-`lobby` phase are flagged `waiting: true` and stay sidelined until the next `reset()` promotes them.
- **Multi-tab support via `connectionCounts`.** A player is only marked offline when their WS count hits 0; removal then waits `OFFLINE_REMOVE_MS` (2s) so reloads don't kick them. If you change the disconnect path, keep this property.
- **Prank input clamps:** 100–3000 Hz, 100–2000 ms (`Lobby.prank`). These are safety limits — don't relax them. A buzzer driven outside that range can stick on or sound awful.

## Running it

```bash
npm install
npm run build              # TS -> build/
npm run develop            # dev mode, single port 8080
# OR
npm run build && npm run build-web && npm run start   # prod-ish
```

The dev server is at `http://127.0.0.1:8080/`. Web Serial requires a secure context, so for production put it behind HTTPS (Caddy/nginx) — `127.0.0.1` and `localhost` are treated as secure for development.

## Things to avoid

- Do **not** add database persistence "just in case" — this app is single-process by design and the in-memory model is load-bearing for simplicity.
- Do **not** introduce a global admin token. Teacher auth is per-lobby on purpose so a teacher who creates a lobby can't poke another teacher's lobby.
- Do **not** route Arduino I/O through the server. See "Architecture rule" above.
- Do **not** edit `public/js/api.js` by hand — it's regenerated by `npm run build-web`.
