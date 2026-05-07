function readCode () {
	try {
		const params = new URLSearchParams(location.search);
		const fromUrl = (params.get("code") || "").trim();
		if (/^[0-9]{5}$/.test(fromUrl)) return fromUrl;
	} catch (e) {}
	const fromStorage = (localStorage.getItem("arduinoboss_last_code") || "").trim();
	if (/^[0-9]{5}$/.test(fromStorage)) return fromStorage;
	return "";
}

const code = readCode();
if (!code) {
	location.href = "/";
}

document.getElementById("codeLabel").textContent = code;
localStorage.setItem("arduinoboss_last_code", code);

document.getElementById("goGame").href = "/game.hott?code=" + encodeURIComponent(code);
document.getElementById("bossSlot").innerHTML = window.BOSS_SVG;

const NAME_KEY = "arduinoboss_name_" + code;
let myName = localStorage.getItem(NAME_KEY) || null;

if (!myName) {
	location.href = "/?code=" + encodeURIComponent(code);
}

document.getElementById("meName").textContent = myName || "…";

let countdownTimer = null;
let lastPhase = null;
let removalTimer = null;

function showToast (msg) {
	const t = document.getElementById("toast");
	t.textContent = msg;
	t.classList.add("show");
	clearTimeout(showToast._tid);
	showToast._tid = setTimeout(function () { t.classList.remove("show"); }, 2400);
}

async function leave () {
	if (!myName) return;
	try { await GameAPI.leave(code, myName); } catch (e) {}
	localStorage.removeItem(NAME_KEY);
	GameWS.disconnect();
	location.href = "/";
}

document.getElementById("leaveBtn").addEventListener("click", leave);

// ---------- Arduino ----------
const serialStatus = document.getElementById("serialStatus");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

function reportArduino (connected) {
	if (!myName) return;
	GameAPI.setArduinoStatus(code, myName, connected).catch(function () {});
}

function setUiConnected () {
	serialStatus.textContent = "connected";
	serialStatus.className = "serial-status connected";
	connectBtn.textContent = "Change Arduino";
	disconnectBtn.style.display = "inline-block";
}

function setUiDisconnected (msg, asError) {
	serialStatus.textContent = msg || "disconnected";
	serialStatus.className = "serial-status" + (asError ? " error" : "");
	connectBtn.textContent = "Connect Arduino";
	disconnectBtn.style.display = "none";
}

ArduinoSerial.setOnLine(function (line) {
	// In the lobby we don't act on lines, but BTN events may arrive — ignore them.
});
ArduinoSerial.setOnClose(function () {
	if (connectBtn.disabled) return;
	setUiDisconnected("disconnected", true);
	connectBtn.textContent = "Reconnect Arduino";
	reportArduino(false);
});

async function doConnect () {
	connectBtn.disabled = true;
	disconnectBtn.disabled = true;
	if (ArduinoSerial.isConnected()) {
		try { await ArduinoSerial.disconnect(); } catch (e) {}
	}
	connectBtn.textContent = "Connecting...";
	serialStatus.textContent = "connecting...";
	serialStatus.className = "serial-status";
	try {
		await ArduinoSerial.connect(9600);
		setUiConnected();
		reportArduino(true);
		try {
			await ArduinoSerial.ledOn();
			setTimeout(function () { ArduinoSerial.ledOff(); }, 200);
			await ArduinoSerial.buzz(880);
			setTimeout(function () { ArduinoSerial.buzzOff(); }, 200);
		} catch (e) {}
	} catch (e) {
		const msg = (e && e.message) ? e.message : "connection failed";
		setUiDisconnected(msg, true);
		connectBtn.textContent = "Try Different Port";
	} finally {
		connectBtn.disabled = false;
		disconnectBtn.disabled = false;
	}
}

async function doDisconnect () {
	if (!ArduinoSerial.isConnected()) {
		setUiDisconnected();
		return;
	}
	disconnectBtn.disabled = true;
	try { await ArduinoSerial.disconnect(); } catch (e) {}
	setUiDisconnected();
	reportArduino(false);
	disconnectBtn.disabled = false;
}

connectBtn.addEventListener("click", doConnect);
disconnectBtn.addEventListener("click", doDisconnect);

// Try to silently reconnect to a previously-authorized port.
ArduinoSerial.tryAutoReconnect(9600).then(function (ok) {
	if (ok) {
		setUiConnected();
		reportArduino(true);
	}
});

// ---------- State ----------
function renderCountdown (state) {
	const overlay = document.getElementById("countdownOverlay");
	const label = document.getElementById("countdownLabel");
	const number = document.getElementById("countdownNumber");
	const sub = document.getElementById("countdownSub");

	if (!state.transition) {
		overlay.classList.remove("active", "reset");
		if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
		return;
	}

	overlay.classList.add("active");
	if (state.transition.type === "starting") {
		overlay.classList.remove("reset");
		label.textContent = "GET READY";
		sub.textContent = "Boss battle begins in...";
	} else {
		overlay.classList.add("reset");
		label.textContent = "BACK TO LOBBY";
		sub.textContent = "Teacher is sending everyone back to the lobby...";
	}

	const localStart = Date.now();
	const remainingAtState = state.transition.endsAt - state.serverTime;
	function tick () {
		const elapsed = Date.now() - localStart;
		const remaining = remainingAtState - elapsed;
		number.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
		if (remaining <= 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
	}
	tick();
	if (countdownTimer) clearInterval(countdownTimer);
	countdownTimer = setInterval(tick, 200);
}

function renderPlayerListItem (p, state) {
	const youTag = p.name === myName ? ' <span class="dim">(you)</span>' : '';
	const arduinoBadge = p.arduinoConnected
		? ' <span style="color:var(--good);font-size:12px;">⚡ Arduino</span>'
		: ' <span class="dim" style="font-size:12px;">no Arduino</span>';
	let statusBadge = '';
	if (p.waiting) statusBadge = ' <span style="color:var(--accent);font-size:12px;">(waiting next round)</span>';
	else if (p.hp <= 0 && state.phase === "playing") statusBadge = ' <span style="color:var(--bad);font-size:12px;">(out)</span>';

	let offlineBadge = '';
	if (!p.connected && p.disconnectedAt) {
		offlineBadge = ' <span style="color:var(--ink-dim);font-size:12px;">(offline <span data-countdown="' + p.name + '" data-disconnected-at="' + p.disconnectedAt + '">2</span>s)</span>';
	}
	return '<li>' + p.name + youTag + arduinoBadge + statusBadge + offlineBadge + '</li>';
}

function startRemovalCountdownTicker () {
	if (removalTimer) return;
	removalTimer = setInterval(function () {
		const els = document.querySelectorAll("[data-disconnected-at]");
		if (els.length === 0) {
			clearInterval(removalTimer); removalTimer = null;
			return;
		}
		const now = Date.now();
		els.forEach(function (el) {
			const at = parseInt(el.getAttribute("data-disconnected-at"), 10);
			if (!at) return;
			const remaining = (at + 2000) - now;
			el.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
		});
	}, 200);
}

function applyState (state) {
	document.getElementById("phaseLabel").textContent = state.phase;
	renderCountdown(state);
	lastPhase = state.phase;

	const me = state.players.find(function (p) { return p.name === myName; });
	const stillJoined = !!me;
	const iAmWaiting = me && me.waiting;

	const statusEl = document.getElementById("myStatus");
	if (iAmWaiting) {
		statusEl.innerHTML = 'You are <b id="meName">' + myName + '</b>. <span style="color:var(--accent);">Waiting for the next round to start.</span>';
	} else if (stillJoined) {
		statusEl.innerHTML = 'You are <b id="meName">' + myName + '</b>.';
	}

	if (!iAmWaiting && (state.phase === "starting" || state.phase === "playing")) {
		showToast("Game starting!");
		setTimeout(function () { location.href = "/game.hott?code=" + encodeURIComponent(code); }, 200);
		return;
	}

	const list = document.getElementById("playerList");
	if (state.players.length === 0) {
		list.innerHTML = '<li class="empty">Nobody yet — be the first!</li>';
	} else {
		list.innerHTML = state.players.map(function (p) { return renderPlayerListItem(p, state); }).join('');
		startRemovalCountdownTicker();
	}

	if (state.phase === "resetting") return;

	if (!stillJoined) {
		showToast("Your seat was removed. Pick again.");
		localStorage.removeItem(NAME_KEY);
		setTimeout(function () { location.href = "/?code=" + encodeURIComponent(code); }, 1200);
	}
}

async function initialFetch () {
	try {
		const state = await GameAPI.lobbyState(code);
		applyState(state);
	} catch (e) {
		showToast("Lobby is gone. Returning to home.");
		setTimeout(function () { location.href = "/"; }, 1200);
	}
}

GameWS.connect("lobby:" + code, myName);
GameWS.on("lobby_state", applyState);
GameWS.on("lobby_gone", function () {
	showToast("Lobby was deleted.");
	setTimeout(function () { location.href = "/"; }, 1200);
});
GameWS.on("emoji", function (data) {
	if (data && data.emoji) GameEmoji.spawn(data.name, data.emoji);
});
GameWS.on("teacher_message", function (data) {
	if (data && data.text) GameEmoji.announce(data.text);
});

GameEmoji.build("emojiBar", function (emoji) {
	if (!myName) return;
	GameAPI.sendEmoji(code, myName, emoji).catch(function () {});
});

initialFetch();
