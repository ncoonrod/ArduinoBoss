# ArduinoBoss Python client

A console player for ArduinoBoss. Mirrors what `public/js/serial.js` + `public/js/api.js` + `public/js/ws.js` + `public/js/game.js` do in the browser, minus the UI and audio: open the Arduino over serial, join a lobby, connect the WebSocket, listen for attacks, and report hits/misses.

## Requirements

- Python 3.10+
- An Arduino flashed with `arduino/ArduinoBoss/ArduinoBoss.ino`
- Serial port permission:
  - **Linux:** add yourself to `dialout` (`sudo usermod -aG dialout $USER`, then log out/in)
  - **Windows:** the COM port shows up automatically once Arduino is plugged in
  - **macOS:** the device appears as `/dev/cu.usbmodemXXXX`

## Install

```sh
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```sh
# List available serial ports
python -m arduinoboss --list-ports

# Join lobby 12345 as "Aria" using auto-detected serial port
python -m arduinoboss --code 12345 --name Aria

# Specify everything explicitly
python -m arduinoboss \
    --base-url https://boss.highersoftware.com \
    --code 12345 \
    --name Aria \
    --port /dev/ttyACM0 \
    --baud 9600
```

If you `pip install .` the project, the `arduinoboss` script is also placed on `$PATH`:

```sh
arduinoboss --code 12345 --name Aria
```

## What it does

1. Opens the serial port at 9600 baud and reads `BTN:PRESS` events.
2. POSTs `/v1/game/join`, then `/v1/game/set_arduino_status` with `connected: true`.
3. Connects the Socket.IO WebSocket with auth `{ tag: "lobby:<code>", name: "<name>" }`.
4. On every `lobby_state` push:
   - If the boss is attacking *you* and it's a new attack, drives `LED:ON` + `BUZZ:900` and arms a miss timer.
   - Schedules `report_miss` if the attack expires without a button press.
5. On `BTN:PRESS` from the Arduino, calls `report_hit` (mid-attack) or `report_early_press` (otherwise).
6. On `prank` events, plays the buzzer for the requested frequency and duration.
7. Ctrl-C cleanly leaves the lobby and tells the server the Arduino went offline.

## Project layout

| File | Mirrors |
|------|---------|
| `arduinoboss/serial_client.py` | `public/js/serial.js` |
| `arduinoboss/api.py` | `public/js/api.js` |
| `arduinoboss/ws.py` | `public/js/ws.js` |
| `arduinoboss/cli.py` | `public/js/game.js` (player flow) |

## Notes

- The browser client uses Web Audio + on-screen UI; this console client uses only the Arduino LED/buzzer and stdout. The block UX is identical — the Arduino's tactile button is the input.
- Teacher endpoints (`create_lobby`, `start_game`, etc.) are intentionally not exposed — this is a player client.
