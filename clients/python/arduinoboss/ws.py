"""Mirrors public/js/ws.js — Socket.IO client that unwraps HotStaq's { uuid, data } envelope."""
from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

import socketio


Handler = Callable[[Any], Awaitable[None] | None]


def _unwrap(payload: Any) -> Any:
	if isinstance(payload, dict) and "uuid" in payload and "data" in payload:
		return payload["data"]
	return payload


class GameWebSocket:
	"""Async Socket.IO wrapper. Use connect()/wait()/disconnect() in an asyncio context."""

	def __init__(self, base_url: str, tag: str, name: Optional[str] = None):
		self._base_url = base_url.rstrip("/")
		self._auth: dict[str, str] = {"tag": tag}
		if name:
			self._auth["name"] = name
		self._sio = socketio.AsyncClient(
			reconnection=True,
			reconnection_delay=0.5,
			reconnection_delay_max=4,
		)
		self._handlers: dict[str, Handler] = {}

		# Generic dispatcher. python-socketio doesn't have a "catch-all" beyond `*`,
		# so we register each event explicitly when the caller calls .on().

	def on(self, event: str, fn: Handler) -> None:
		self._handlers[event] = fn

		async def _wrapper(payload):
			data = _unwrap(payload)
			res = fn(data)
			if hasattr(res, "__await__"):
				await res

		self._sio.on(event, _wrapper)

	async def connect(self) -> None:
		# python-socketio wants the server URL only; path defaults to /socket.io.
		await self._sio.connect(
			self._base_url,
			auth=self._auth,
			transports=["websocket"],
			socketio_path="/socket.io",
		)

	async def wait(self) -> None:
		"""Block until the socket disconnects (e.g. server sent lobby_gone)."""
		await self._sio.wait()

	async def disconnect(self) -> None:
		try:
			await self._sio.disconnect()
		except Exception:
			pass

	@property
	def connected(self) -> bool:
		return self._sio.connected
