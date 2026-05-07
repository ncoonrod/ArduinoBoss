window.GameWS = (function () {
	let socket = null;

	function connect (tag, name) {
		if (socket && socket.connected) return socket;
		const auth = { tag: tag };
		if (name) auth.name = name;
		// eslint-disable-next-line no-undef
		socket = io({
			path: "/socket.io",
			auth: auth,
			transports: ["websocket", "polling"],
			reconnection: true,
			reconnectionDelay: 500,
			reconnectionDelayMax: 4000
		});
		return socket;
	}

	function unwrap (payload) {
		// HotStaq wraps server-sent events as { uuid, data }. Unwrap to the raw payload.
		if (payload && typeof payload === "object" && "uuid" in payload && "data" in payload) {
			return payload.data;
		}
		return payload;
	}

	function on (event, cb) {
		if (!socket) return;
		socket.on(event, function (payload) { cb(unwrap(payload)); });
	}

	function off (event, cb) {
		if (!socket) return;
		socket.off(event, cb);
	}

	function disconnect () {
		if (socket) {
			try { socket.disconnect(); } catch (e) {}
			socket = null;
		}
	}

	function isConnected () { return socket && socket.connected; }

	return { connect, on, off, disconnect, isConnected };
})();
