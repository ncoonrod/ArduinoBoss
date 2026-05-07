"""Mirrors public/js/api.js — POST JSON to /v1/game/<method>, return parsed JSON."""
from __future__ import annotations

from typing import Any

import httpx


class GameApi:
	def __init__(self, base_url: str, timeout: float = 5.0):
		self._client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout)

	async def _call(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
		res = await self._client.post(path, json=body or {})
		text = res.text
		if res.status_code >= 400:
			try:
				err = res.json().get("error")
			except Exception:
				err = None
			raise RuntimeError(err or f"HTTP {res.status_code}: {text}")
		return res.json()

	# ---- player endpoints ----
	async def lobby_state(self, code: str) -> dict[str, Any]:
		return await self._call("/v1/game/lobby_state", {"code": code})

	async def list_names(self, code: str) -> Any:
		return await self._call("/v1/game/list_names", {"code": code})

	async def join(self, code: str, name: str) -> dict[str, Any]:
		return await self._call("/v1/game/join", {"code": code, "name": name})

	async def leave(self, code: str, name: str) -> dict[str, Any]:
		return await self._call("/v1/game/leave", {"code": code, "name": name})

	async def report_hit(self, code: str, name: str, attack_id: str) -> dict[str, Any]:
		return await self._call("/v1/game/report_hit",
								 {"code": code, "name": name, "attackId": attack_id})

	async def report_miss(self, code: str, name: str, attack_id: str) -> dict[str, Any]:
		return await self._call("/v1/game/report_miss",
								 {"code": code, "name": name, "attackId": attack_id})

	async def set_arduino_status(self, code: str, name: str, connected: bool) -> dict[str, Any]:
		return await self._call("/v1/game/set_arduino_status",
								 {"code": code, "name": name, "connected": connected})

	async def report_early_press(self, code: str, name: str) -> dict[str, Any]:
		return await self._call("/v1/game/report_early_press", {"code": code, "name": name})

	async def send_emoji(self, code: str, name: str, emoji: str) -> dict[str, Any]:
		return await self._call("/v1/game/send_emoji",
								 {"code": code, "name": name, "emoji": emoji})

	async def prank(self, code: str, sender: str, target: str, freq: int, duration_ms: int) -> dict[str, Any]:
		return await self._call("/v1/game/prank",
								 {"code": code, "from": sender, "target": target,
								  "freq": int(freq), "durationMs": int(duration_ms)})

	async def aclose(self) -> None:
		await self._client.aclose()
