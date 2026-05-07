"""Mirrors public/js/serial.js — line-buffered serial I/O to the Arduino station."""
from __future__ import annotations

import asyncio
import threading
from typing import Awaitable, Callable, Optional

import serial
import serial.tools.list_ports


LineHandler = Callable[[str], Awaitable[None] | None]


class ArduinoSerial:
	"""Open the Arduino, run a background reader, dispatch line callbacks on the asyncio loop."""

	def __init__(self, port: str, baud_rate: int = 9600):
		self._port_name = port
		self._baud = baud_rate
		self._port: Optional[serial.Serial] = None
		self._reader_thread: Optional[threading.Thread] = None
		self._stop = threading.Event()
		self._on_line: Optional[LineHandler] = None
		self._on_close: Optional[Callable[[], None]] = None
		self._loop: Optional[asyncio.AbstractEventLoop] = None

	@property
	def is_open(self) -> bool:
		return self._port is not None and self._port.is_open

	def open(self, loop: asyncio.AbstractEventLoop) -> None:
		# Read timeout makes the blocking readline() return periodically so we can
		# check the stop flag without parking forever on an idle Arduino.
		self._port = serial.Serial(self._port_name, self._baud, timeout=0.2)
		self._loop = loop
		self._stop.clear()
		self._reader_thread = threading.Thread(target=self._read_loop, name="arduino-reader", daemon=True)
		self._reader_thread.start()

	def _read_loop(self) -> None:
		buf = b""
		try:
			while not self._stop.is_set() and self._port and self._port.is_open:
				try:
					chunk = self._port.read(128)
				except serial.SerialException:
					break
				if not chunk:
					continue
				buf += chunk
				while b"\n" in buf:
					line_b, buf = buf.split(b"\n", 1)
					line = line_b.decode("ascii", errors="replace").strip()
					if not line:
						continue
					self._dispatch_line(line)
		finally:
			if self._on_close and self._loop:
				self._loop.call_soon_threadsafe(self._on_close)

	def _dispatch_line(self, line: str) -> None:
		handler = self._on_line
		loop = self._loop
		if handler is None or loop is None:
			return
		# Schedule on the asyncio loop so handlers can be coroutines.
		def _fire():
			res = handler(line)
			if asyncio.iscoroutine(res):
				asyncio.create_task(res)
		loop.call_soon_threadsafe(_fire)

	def on_line(self, fn: LineHandler) -> None:
		self._on_line = fn

	def on_close(self, fn: Callable[[], None]) -> None:
		self._on_close = fn

	def write(self, command: str) -> None:
		if not self.is_open or self._port is None:
			return
		try:
			self._port.write((command + "\n").encode("ascii"))
		except serial.SerialException:
			pass

	def led_on(self) -> None: self.write("LED:ON")
	def led_off(self) -> None: self.write("LED:OFF")
	def buzz(self, freq: int) -> None: self.write(f"BUZZ:{int(freq)}")
	def buzz_off(self) -> None: self.write("BUZZ:OFF")
	def attack(self, duration_ms: int) -> None: self.write(f"ATTACK:{int(duration_ms)}")

	def close(self) -> None:
		self._stop.set()
		if self._reader_thread:
			self._reader_thread.join(timeout=0.5)
			self._reader_thread = None
		if self._port and self._port.is_open:
			try:
				self._port.close()
			except serial.SerialException:
				pass
		self._port = None

	@staticmethod
	def list_ports() -> list[str]:
		return [p.device for p in serial.tools.list_ports.comports()]
