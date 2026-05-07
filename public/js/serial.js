// Web Serial wrapper for the Arduino game station.
// Reads line-delimited messages from the Arduino, writes line-delimited commands.
window.ArduinoSerial = (function () {
	let port = null;
	let writer = null;
	let reader = null;
	let readableStreamClosed = null;
	let readBuf = "";
	let onLine = () => {};
	let onClose = () => {};
	let readLoopActive = false;
	let readLoopPromise = null;
	const encoderSend = new TextEncoder();

	function setupStreams (baudRate) {
		const textDecoder = new TextDecoderStream();
		// Track the pipeTo promise so disconnect can await it before closing the port.
		readableStreamClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
		reader = textDecoder.readable.getReader();
		writer = port.writable.getWriter();
		readLoopActive = true;
		readLoopPromise = readLoop();
	}

	async function connect (baudRate) {
		if (!("serial" in navigator)) {
			throw new Error("Web Serial not supported. Use Chrome or Edge.");
		}
		if (port) {
			try { await disconnect(); } catch (e) {}
		}

		const newPort = await navigator.serial.requestPort();
		try {
			await newPort.open({ baudRate: baudRate || 9600 });
		} catch (e) {
			throw new Error(e && e.message ? e.message : "could not open port");
		}

		port = newPort;
		try {
			setupStreams(baudRate);
			return port.getInfo();
		} catch (e) {
			try { if (port) await port.close(); } catch (_) {}
			port = null; writer = null; reader = null; readableStreamClosed = null;
			throw e;
		}
	}

	async function readLoop () {
		try {
			while (readLoopActive) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				readBuf += value;
				let idx;
				while ((idx = readBuf.indexOf("\n")) >= 0) {
					const line = readBuf.slice(0, idx).trim();
					readBuf = readBuf.slice(idx + 1);
					if (line.length > 0) {
						try { onLine(line); } catch (e) { console.error(e); }
					}
				}
			}
		} catch (e) {
			// Cancel/abort throws here — that's expected during disconnect.
		} finally {
			try { onClose(); } catch (e) {}
		}
	}

	async function write (cmd) {
		if (!writer) return;
		try {
			await writer.write(encoderSend.encode(cmd + "\n"));
		} catch (e) {
			// Writer may have been closed; swallow.
		}
	}

	async function disconnect () {
		readLoopActive = false;

		// 1. Cancel the reader. This makes the read loop bail out and aborts the pipeTo.
		if (reader) {
			try { await reader.cancel(); } catch (e) {}
			try { reader.releaseLock(); } catch (e) {}
		}
		// 2. Wait for the pipeTo to fully settle so port.readable is unlocked.
		if (readableStreamClosed) {
			try { await readableStreamClosed; } catch (e) {}
		}
		// 3. Wait for the read loop's finally (which fires onClose) to complete.
		if (readLoopPromise) {
			try { await readLoopPromise; } catch (e) {}
		}
		// 4. Release the writer lock.
		if (writer) {
			try { writer.releaseLock(); } catch (e) {}
		}
		// 5. Now close the port — both streams are unlocked.
		if (port) {
			try { await port.close(); } catch (e) { console.warn("port.close() failed:", e); }
		}

		port = null;
		writer = null;
		reader = null;
		readableStreamClosed = null;
		readLoopPromise = null;
		readBuf = "";
	}

	function isConnected () { return port !== null; }

	async function tryAutoReconnect (baudRate) {
		if (!("serial" in navigator)) return false;
		if (port) return true;
		let ports;
		try { ports = await navigator.serial.getPorts(); }
		catch (e) { return false; }
		if (!ports || ports.length === 0) return false;
		const candidate = ports[ports.length - 1];
		try {
			await candidate.open({ baudRate: baudRate || 9600 });
		} catch (e) {
			return false;
		}
		port = candidate;
		try {
			setupStreams(baudRate);
			return true;
		} catch (e) {
			try { if (port) await port.close(); } catch (_) {}
			port = null; writer = null; reader = null; readableStreamClosed = null;
			return false;
		}
	}

	function setOnLine (fn) { onLine = fn || (() => {}); }
	function setOnClose (fn) { onClose = fn || (() => {}); }

	return {
		connect, disconnect, write,
		isConnected, tryAutoReconnect,
		setOnLine, setOnClose,
		ledOn: () => write("LED:ON"),
		ledOff: () => write("LED:OFF"),
		buzz: (freq) => write("BUZZ:" + Math.round(freq)),
		buzzOff: () => write("BUZZ:OFF"),
		attack: (ms) => write("ATTACK:" + Math.round(ms))
	};
})();
