# ArduinoBoss native clients

Two console clients that play ArduinoBoss without a browser. Both connect to a real Arduino over serial and to the lobby server over HTTP + Socket.IO — exactly like the in-browser game does.

| Client | Path | Toolchain |
|--------|------|-----------|
| .NET 8 | [`dotnet/`](dotnet/) | `dotnet` SDK 8.0+ |
| Python 3.10+ | [`python/`](python/) | `pip` |

Both clients implement the same flow as `public/js/game.js`:

1. Open the Arduino over serial at 9600 baud.
2. Join a lobby (`POST /v1/game/join`).
3. Connect the Socket.IO WebSocket with `{ tag: "lobby:<code>", name: "<name>" }` auth.
4. Listen for `lobby_state` pushes. When the boss attacks *you*, drive the LED + buzzer and arm a miss timer.
5. On `BTN:PRESS` from the Arduino, report a hit (or an early press if no attack is active).
6. On `prank` events, play the buzzer for the requested frequency and duration.
7. Clean up on Ctrl-C: leave the lobby + mark Arduino offline.

What each client deliberately leaves out (these are browser-only): on-screen UI, Web Audio fanfares, emoji reactions, the JS-console "secret" prank discovery prompt, and all teacher-only endpoints.

See each client's README for setup and usage.
