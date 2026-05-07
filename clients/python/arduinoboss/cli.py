"""Mirrors public/js/game.js (player flow) — CLI entry point that runs the player."""
from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from typing import Any

from .api import GameApi
from .serial_client import ArduinoSerial
from .ws import GameWebSocket


DEFAULT_BASE_URL = "https://boss.highersoftware.com"


class Player:
	def __init__(self, *, base_url: str, code: str, name: str, port: str, baud: int):
		self.base_url = base_url
		self.code = code
		self.name = name
		self.serial = ArduinoSerial(port, baud)
		self.api = GameApi(base_url)
		self.ws = GameWebSocket(base_url, f"lobby:{code}", name)

		self.active_attack_id: str | None = None
		self.active_attack_target: str | None = None
		self.last_resolved_attack_id: str | None = None
		self.last_boss_hp: int | None = None
		self.miss_task: asyncio.Task | None = None

	# ---------- defense ----------
	def _end_defense(self) -> None:
		if self.active_attack_id is None:
			return
		self.active_attack_id = None
		self.active_attack_target = None
		if self.serial.is_open:
			self.serial.led_off()
			self.serial.buzz_off()
		if self.miss_task and not self.miss_task.done():
			self.miss_task.cancel()
			self.miss_task = None

	async def _on_button_press(self) -> None:
		if (self.active_attack_id is not None
				and self.active_attack_target == self.name
				and self.last_resolved_attack_id != self.active_attack_id):
			attack_id = self.active_attack_id
			self.last_resolved_attack_id = attack_id
			self._end_defense()
			try:
				res = await self.api.report_hit(self.code, self.name, attack_id)
				if res.get("ok"):
					print(f"[hit] BLOCKED attack {attack_id}")
			except Exception as ex:
				print(f"reportHit: {ex}", file=sys.stderr)
			return
		try:
			res = await self.api.report_early_press(self.code, self.name)
			if res.get("damaged"):
				print("[hit] TOO EARLY (-1 hp)")
		except Exception as ex:
			print(f"reportEarlyPress: {ex}", file=sys.stderr)

	# ---------- state ----------
	async def _on_lobby_state(self, state: dict[str, Any]) -> None:
		boss_hp = state.get("bossHp")
		if self.last_boss_hp is not None and boss_hp is not None and boss_hp < self.last_boss_hp:
			max_hp = state.get("maxBossHp", 0)
			print(f"[boss] took {self.last_boss_hp - boss_hp} damage ({boss_hp}/{max_hp})")
		self.last_boss_hp = boss_hp

		phase = state.get("phase")
		if phase != "playing":
			self._end_defense()
			print(f"[phase] {phase}")
			return

		attack = state.get("currentAttack")
		if attack and attack["id"] != self.active_attack_id and self.last_resolved_attack_id != attack["id"]:
			if attack.get("target") == self.name:
				self.active_attack_id = attack["id"]
				self.active_attack_target = attack["target"]
				dur = int(attack.get("durationMs", 0))
				print(f"[attack] INCOMING — block within {dur} ms")
				if self.serial.is_open:
					self.serial.led_on()
					self.serial.buzz(900)
				server_now = int(state.get("serverTime", 0))
				expires = int(attack.get("startedAt", 0)) + dur
				delay_ms = max(200, (expires - server_now) + 200)
				self.miss_task = asyncio.create_task(self._miss_timer(attack["id"], delay_ms / 1000.0))
			else:
				print(f"[attack] boss is hitting {attack['target']}")
		if attack is None and self.active_attack_id is not None:
			self._end_defense()

	async def _miss_timer(self, attack_id: str, delay_s: float) -> None:
		try:
			await asyncio.sleep(delay_s)
		except asyncio.CancelledError:
			return
		if self.active_attack_id == attack_id and self.last_resolved_attack_id != attack_id:
			self.last_resolved_attack_id = attack_id
			self._end_defense()
			print(f"[miss] {attack_id}")
			try:
				await self.api.report_miss(self.code, self.name, attack_id)
			except Exception:
				pass

	def _on_lobby_gone(self, _: Any) -> None:
		print("[lobby] deleted")

	def _on_prank(self, data: dict[str, Any]) -> None:
		if data.get("target") != self.name:
			return
		freq = int(data.get("freq", 600))
		dur_ms = int(data.get("durationMs", 400))
		print(f"[prank] from {data.get('from')} ({freq} Hz, {dur_ms} ms)")
		if not self.serial.is_open:
			return
		self.serial.buzz(freq)
		asyncio.get_running_loop().call_later(dur_ms / 1000.0, self.serial.buzz_off)

	def _on_teacher_message(self, data: dict[str, Any]) -> None:
		print(f"[teacher] {data.get('text')}")

	# ---------- driver ----------
	async def run(self) -> int:
		loop = asyncio.get_running_loop()

		async def serial_handler(line: str) -> None:
			print(f"<- {line}")
			if line == "BTN:PRESS":
				await self._on_button_press()
		self.serial.on_line(serial_handler)
		self.serial.on_close(lambda: print("[serial] closed"))

		self.ws.on("lobby_state", self._on_lobby_state)
		self.ws.on("lobby_gone", self._on_lobby_gone)
		self.ws.on("prank", self._on_prank)
		self.ws.on("teacher_message", self._on_teacher_message)

		self.serial.open(loop)
		print(f"[serial] opened {self.serial._port_name}")  # noqa: SLF001 — local helper

		try:
			await self.api.join(self.code, self.name)
			print("[api] joined")
		except Exception as ex:
			print(f"join failed: {ex}", file=sys.stderr)
			return 3

		try:
			await self.api.set_arduino_status(self.code, self.name, True)
		except Exception:
			pass

		await self.ws.connect()
		print("[ws] connected")
		print()
		print("Press the button on your Arduino to block. Ctrl-C to leave.")
		print()

		stop = asyncio.Event()
		def _signal_handler():
			stop.set()
		try:
			loop.add_signal_handler(signal.SIGINT, _signal_handler)
			loop.add_signal_handler(signal.SIGTERM, _signal_handler)
		except NotImplementedError:
			pass  # Windows

		await stop.wait()

		print("[exit] leaving lobby...")
		try: await self.api.set_arduino_status(self.code, self.name, False)
		except Exception: pass
		try: await self.api.leave(self.code, self.name)
		except Exception: pass
		await self.ws.disconnect()
		await self.api.aclose()
		self.serial.close()
		return 0


def main() -> int:
	p = argparse.ArgumentParser(prog="arduinoboss", description="ArduinoBoss player client")
	p.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Server URL (default: {DEFAULT_BASE_URL})")
	p.add_argument("--code", help="5-digit lobby code")
	p.add_argument("--name", help="Player name (must already be in the approved list)")
	p.add_argument("--port", help="Serial port (e.g. /dev/ttyACM0 or COM3). Auto-detects if omitted.")
	p.add_argument("--baud", type=int, default=9600)
	p.add_argument("--list-ports", action="store_true", help="List available serial ports and exit")
	args = p.parse_args()

	if args.list_ports:
		for port in ArduinoSerial.list_ports():
			print(port)
		return 0

	if not args.code or not args.name:
		p.print_help()
		return 1

	port = args.port
	if not port:
		ports = ArduinoSerial.list_ports()
		if not ports:
			print("No serial port detected. Pass --port /dev/ttyACM0 (Linux) or COM3 (Windows).",
				  file=sys.stderr)
			return 2
		port = ports[0]

	print(f"server : {args.base_url}")
	print(f"lobby  : {args.code}")
	print(f"name   : {args.name}")
	print(f"serial : {port} @ {args.baud}")
	print()

	player = Player(base_url=args.base_url, code=args.code, name=args.name, port=port, baud=args.baud)
	return asyncio.run(player.run())


if __name__ == "__main__":
	raise SystemExit(main())
