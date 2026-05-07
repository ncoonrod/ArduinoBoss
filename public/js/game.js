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

document.getElementById("goLobby").href = "/lobby.hott?code=" + encodeURIComponent(code);
document.getElementById("bossSlot").innerHTML = window.BOSS_SVG;

const NAME_KEY = "arduinoboss_name_" + code;
let myName = localStorage.getItem(NAME_KEY) || null;
document.getElementById("meName").textContent = myName || "(none — go to lobby first)";

let lastAttackId = null;
let activeDefense = null;
let lastResolvedId = null;
let lastPhase = null;
let lastTransitionEndsAt = null;
let countdownTimer = null;

function showToast (msg, kind) {
	const t = document.getElementById("toast");
	t.textContent = msg;
	t.style.borderColor = kind === "good" ? "var(--good)" : (kind === "bad" ? "var(--bad)" : "var(--accent)");
	t.classList.add("show");
	clearTimeout(showToast._tid);
	showToast._tid = setTimeout(function () { t.classList.remove("show"); }, 1800);
}

function logSerial (line, dir) {
	const el = document.getElementById("serialLog");
	const arrow = dir === "in" ? "<-" : "->";
	el.textContent += arrow + " " + line + "\n";
	el.scrollTop = el.scrollHeight;
}

const status = document.getElementById("serialStatus");
ArduinoSerial.setOnLine(function (line) {
	logSerial(line, "in");
	if (line === "BTN:PRESS") onButtonPress();
});
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

function reportArduino (connected) {
	if (!myName) return;
	GameAPI.setArduinoStatus(code, myName, connected).catch(function () {});
}

function setUiConnected () {
	status.textContent = "connected";
	status.className = "serial-status connected";
	connectBtn.textContent = "Change Arduino";
	disconnectBtn.style.display = "inline-block";
}

function setUiDisconnected (msg, asError) {
	status.textContent = msg || "disconnected";
	status.className = "serial-status" + (asError ? " error" : "");
	connectBtn.textContent = "Connect Arduino";
	disconnectBtn.style.display = "none";
}

ArduinoSerial.setOnClose(function () {
	if (connectBtn.disabled) return; // suppress while mid-(re)connect
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
	status.textContent = "connecting...";
	status.className = "serial-status";
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

// On-screen Block button. Hidden by default; the teacher can enable it per-player.
const devPressBtn = document.getElementById("devPressBtn");
if (devPressBtn) {
	devPressBtn.addEventListener("click", function () {
		onButtonPress();
	});
}
function syncBlockButton (state) {
	if (!devPressBtn) return;
	const me = state.players.find(function (p) { return p.name === myName; });
	devPressBtn.style.display = (me && me.blockButtonEnabled) ? "inline-block" : "none";
}

// Try to silently reconnect to a previously-authorized port (e.g., user authorized
// it on the lobby page; we don't want to re-prompt here).
ArduinoSerial.tryAutoReconnect(9600).then(function (ok) {
	if (ok) {
		setUiConnected();
		reportArduino(true);
	}
});

let audioCtx = null;
function beep (freq, durMs, type) {
	try {
		if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
		const osc = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		osc.type = type || "square";
		osc.frequency.value = freq;
		gain.gain.value = 0.08;
		osc.connect(gain).connect(audioCtx.destination);
		osc.start();
		osc.stop(audioCtx.currentTime + durMs / 1000);
	} catch (e) {}
}

async function onButtonPress () {
	if (!myName) return;
	const validDefense = activeDefense
		&& activeDefense.target === myName
		&& lastResolvedId !== activeDefense.id;
	if (validDefense) {
		const id = activeDefense.id;
		lastResolvedId = id;
		endDefense(true);
		try {
			const res = await GameAPI.reportHit(code, myName, id);
			if (res && res.ok) {
				showToast("BLOCKED!", "good");
				beep(1200, 120, "triangle");
				setTimeout(function () { beep(1600, 140, "triangle"); }, 120);
				flashBoss();
			}
		} catch (e) {}
		return;
	}
	// Stray press — server decides whether to penalize (hard difficulty only).
	// HP drop (if any) is handled centrally by applyState's hit-sound detector.
	try {
		const res = await GameAPI.reportEarlyPress(code, myName);
		if (res && res.damaged) showToast("TOO EARLY!", "bad");
	} catch (e) {}
}

function startDefense (attack) {
	activeDefense = {
		id: attack.id,
		target: attack.target,
		expiresAt: attack.startedAt + attack.durationMs
	};
	document.getElementById("attackOverlay").classList.add("active");
	if (ArduinoSerial.isConnected()) {
		ArduinoSerial.ledOn();
		ArduinoSerial.buzz(900);
	}
	beep(220, attack.durationMs, "sawtooth");
}

function endDefense () {
	if (!activeDefense) return;
	activeDefense = null;
	document.getElementById("attackOverlay").classList.remove("active");
	if (ArduinoSerial.isConnected()) {
		ArduinoSerial.ledOff();
		ArduinoSerial.buzzOff();
	}
}

function flashBoss () {
	const svg = document.querySelector(".boss-svg");
	if (!svg) return;
	svg.classList.add("hurt");
	setTimeout(function () { svg.classList.remove("hurt"); }, 500);
}

async function playBossHitSound () {
	// A short, punchy two-note hit. Same pattern through both browser audio
	// and the Arduino buzzer so kids hear it on their station too.
	beep(880, 80, "square");
	setTimeout(function () { beep(560, 110, "sawtooth"); }, 70);
	if (!ArduinoSerial.isConnected()) return;
	try {
		await ArduinoSerial.buzz(880);
		setTimeout(async function () {
			try { await ArduinoSerial.buzz(560); } catch (e) {}
			setTimeout(function () {
				try { ArduinoSerial.buzzOff(); } catch (e) {}
			}, 120);
		}, 80);
	} catch (e) {}
}

function setBossDead (isDead) {
	const svg = document.querySelector(".boss-svg");
	if (!svg) return;
	if (isDead) svg.classList.add("dead");
	else svg.classList.remove("dead");
}

function playMyHitSound () {
	// Same low square-wave buzz used for "MISSED!" — used for any HP loss
	// (missed defense, early-press penalty, etc). Plays on both browser audio
	// and the Arduino buzzer.
	beep(150, 250, "square");
	if (!ArduinoSerial.isConnected()) return;
	// Passive piezo buzzers are inaudible at 150 Hz — they need a few hundred
	// Hz minimum. Play a quick descending "wah-wah" so kids actually hear it.
	try {
		ArduinoSerial.buzz(440);
		setTimeout(function () { try { ArduinoSerial.buzz(330); } catch (e) {} }, 90);
		setTimeout(function () { try { ArduinoSerial.buzz(220); } catch (e) {} }, 180);
		setTimeout(function () { try { ArduinoSerial.buzzOff(); } catch (e) {} }, 360);
	} catch (e) {}
}

function flashScreenRed () {
	const el = document.createElement("div");
	el.className = "hit-flash";
	document.body.appendChild(el);
	setTimeout(function () { el.remove(); }, 500);
}

let lastMyHp = null;

let lastBossHp = null;

let victoryJinglePlayed = false;
let defeatJinglePlayed = false;

async function playVictoryJingle () {
	// Major-arpeggio fanfare (C, E, G, C+, then a higher G on top).
	const notes = [
		[523, 160], [659, 160], [784, 160], [1046, 240], [784, 100], [1046, 360]
	];
	const useArduino = ArduinoSerial.isConnected();
	for (const [freq, dur] of notes) {
		try {
			if (useArduino) { await ArduinoSerial.ledOn(); await ArduinoSerial.buzz(freq); }
		} catch (e) {}
		beep(freq, dur, "triangle");
		await new Promise(function (r) { setTimeout(r, dur); });
		try {
			if (useArduino) { await ArduinoSerial.ledOff(); await ArduinoSerial.buzzOff(); }
		} catch (e) {}
		await new Promise(function (r) { setTimeout(r, 50); });
	}
}

async function playDefeatJingle () {
	// Sad descending pair.
	const notes = [[392, 240], [330, 240], [262, 480]];
	const useArduino = ArduinoSerial.isConnected();
	for (const [freq, dur] of notes) {
		try { if (useArduino) await ArduinoSerial.buzz(freq); } catch (e) {}
		beep(freq, dur, "sawtooth");
		await new Promise(function (r) { setTimeout(r, dur); });
		try { if (useArduino) await ArduinoSerial.buzzOff(); } catch (e) {}
		await new Promise(function (r) { setTimeout(r, 60); });
	}
}

function renderPlayerCards (state) {
	const cards = document.getElementById("playerCards");
	const targetName = state.currentAttack ? state.currentAttack.target : null;
	const active = state.players.filter(function (p) { return !p.waiting; });
	cards.innerHTML = active.map(function (p) {
		const isMe = p.name === myName;
		const isTarget = p.name === targetName;
		const isDead = p.hp <= 0;
		const cls = ["player-card"];
		if (isMe) cls.push("me");
		if (isTarget) cls.push("target");
		if (isDead) cls.push("dead");
		const hearts = [];
		for (let i = 0; i < p.maxHp; i++) {
			hearts.push('<div class="heart' + (i < p.hp ? '' : ' lost') + '"></div>');
		}
		let extras = '';
		if (!p.connected) extras += ' <span class="dim" style="font-size:11px;">(offline)</span>';
		if (p.paused) extras += ' <span style="color:#7ad8ff;font-size:11px;">⏸ paused</span>';
		return '<div class="' + cls.join(' ') + '">'
			+ '<div class="pc-name">'
			+ '<span>' + p.name + (isMe ? ' (you)' : '') + extras + '</span>'
			+ '<span class="pc-score">' + p.score + ' pts</span>'
			+ '</div>'
			+ '<div class="hp-row">' + hearts.join('') + '</div>'
			+ '</div>';
	}).join('');
}

function renderPauseOverlay (state) {
	let overlay = document.getElementById("pauseOverlay");
	const me = state.players.find(function (p) { return p.name === myName; });
	const iAmPaused = me && me.paused;
	if (iAmPaused) {
		if (!overlay) {
			overlay = document.createElement("div");
			overlay.id = "pauseOverlay";
			overlay.style.cssText = "position:fixed;inset:0;background:rgba(10,20,40,0.9);z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;padding:24px;";
			overlay.innerHTML = '<div style="font-family:Impact,sans-serif;font-size:64px;letter-spacing:4px;color:#7ad8ff;text-shadow:0 0 30px rgba(122,216,255,0.6);">⏸ PAUSED</div>'
				+ '<div style="margin-top:18px;font-size:18px;color:#cdd5f0;">Your teacher paused you.</div>'
				+ '<div style="margin-top:6px;font-size:14px;color:#9aa3c7;">You won\'t be attacked while paused. Wait for them to resume you.</div>';
			document.body.appendChild(overlay);
		}
	} else if (overlay) {
		overlay.remove();
	}
}

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

	const localStartTime = Date.now();
	const remainingAtState = state.transition.endsAt - state.serverTime;

	function tick () {
		const elapsed = Date.now() - localStartTime;
		const remaining = remainingAtState - elapsed;
		const seconds = Math.max(0, Math.ceil(remaining / 1000));
		number.textContent = String(seconds);
		if (remaining <= 0) {
			if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
		}
	}
	tick();
	if (countdownTimer) clearInterval(countdownTimer);
	countdownTimer = setInterval(tick, 200);
}

function applyState (state) {
	document.getElementById("bossHpLabel").textContent = state.bossHp + "/" + state.maxBossHp;
	document.getElementById("bossHpFill").style.width = (100 * state.bossHp / state.maxBossHp) + "%";

	// Boss took damage — react for everyone, not just the player who landed the hit.
	if (lastBossHp !== null && state.bossHp < lastBossHp && state.phase !== "victory") {
		flashBoss();
		playBossHitSound();
	}
	lastBossHp = state.bossHp;

	// Toggle the dead face on victory; clear it for any other phase.
	setBossDead(state.phase === "victory");

	// I took damage (any cause) — play the miss/hit sound + flash the screen red.
	const meForHit = state.players.find(function (p) { return p.name === myName; });
	if (meForHit) {
		if (lastMyHp !== null && meForHit.hp < lastMyHp) {
			playMyHitSound();
			flashScreenRed();
		}
		lastMyHp = meForHit.hp;
	}

	renderPlayerCards(state);
	renderCountdown(state);
	renderPauseOverlay(state);
	syncBlockButton(state);

	const phaseMsg = document.getElementById("phaseMsg");

	// Phase transitions for redirects
	if (state.phase === "lobby" && lastPhase && lastPhase !== "lobby") {
		const stillJoined = state.players.some(function (p) { return p.name === myName; });
		if (stillJoined) {
			// Reset preserved my seat — head back to the lobby waiting room.
			setTimeout(function () { location.href = "/lobby.hott?code=" + encodeURIComponent(code); }, 300);
		} else {
			localStorage.removeItem(NAME_KEY);
			setTimeout(function () { location.href = "/?code=" + encodeURIComponent(code); }, 300);
		}
		lastPhase = state.phase;
		return;
	}
	lastPhase = state.phase;

	// If I somehow ended up on the game page as a waiting player (e.g., direct nav),
	// bounce me back to the lobby room.
	const me = state.players.find(function (p) { return p.name === myName; });
	if (me && me.waiting) {
		location.href = "/lobby.hott?code=" + encodeURIComponent(code);
		return;
	}

	if (state.phase === "lobby") {
		phaseMsg.textContent = "Waiting in the lobby. Teacher must press Start.";
		if (activeDefense) endDefense();
		lastAttackId = null;
		return;
	}
	if (state.phase === "starting") {
		phaseMsg.textContent = "";
		if (activeDefense) endDefense();
		return;
	}
	if (state.phase === "resetting") {
		phaseMsg.textContent = "";
		if (activeDefense) endDefense();
		return;
	}
	if (state.phase === "playing") {
		phaseMsg.textContent = state.currentAttack
			? "Boss is attacking " + state.currentAttack.target + "!"
			: "Boss is preparing the next attack...";

		const a = state.currentAttack;
		if (a && a.id !== lastAttackId) {
			lastAttackId = a.id;
			if (a.target === myName) {
				startDefense(a);
				const remaining = (a.startedAt + a.durationMs) - state.serverTime + 200;
				setTimeout(function () {
					if (activeDefense && activeDefense.id === a.id && lastResolvedId !== a.id) {
						lastResolvedId = a.id;
						endDefense();
						// Sound is played by the HP-drop detector in applyState so
						// every cause of damage uses the same buzz.
						showToast("MISSED!", "bad");
						GameAPI.reportMiss(code, myName, a.id).catch(function () {});
					}
				}, Math.max(remaining, 200));
			} else {
				beep(180, 120, "sawtooth");
			}
		}
		if (!a && activeDefense) endDefense();
		// New round started — re-arm jingle latches.
		victoryJinglePlayed = false;
		defeatJinglePlayed = false;
	} else if (state.phase === "victory") {
		phaseMsg.innerHTML = '<div class="banner victory">VICTORY!</div>';
		if (activeDefense) endDefense();
		if (!victoryJinglePlayed) {
			victoryJinglePlayed = true;
			playVictoryJingle();
		}
	} else if (state.phase === "defeat") {
		phaseMsg.innerHTML = '<div class="banner defeat">DEFEAT</div>';
		if (activeDefense) endDefense();
		if (!defeatJinglePlayed) {
			defeatJinglePlayed = true;
			playDefeatJingle();
		}
	}
}

async function initialFetch () {
	try {
		const state = await GameAPI.lobbyState(code);
		applyState(state);
	} catch (e) {
		showToast("Lobby not found.");
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
GameWS.on("prank", function (data) {
	if (!data || !myName || data.target !== myName) return;
	const freq = data.freq || 600;
	const dur = data.durationMs || 400;
	beep(freq, dur, "square");
	if (ArduinoSerial.isConnected()) {
		try {
			ArduinoSerial.buzz(freq);
			setTimeout(function () { try { ArduinoSerial.buzzOff(); } catch (e) {} }, dur);
		} catch (e) {}
	}
	showToast("🤫 " + (data.from || "Someone") + " pranked you!", "good");
});

// ---------- Discoverable "secret" ----------
// (Teaching point: this hint is visible to anyone who opens DevTools.
// In real-world IoT, vulnerabilities are often discovered the same way:
// by reading the network requests an app makes.)
console.log("%c🤫 Psst...", "color:#ff5e8a;font-size:18px;font-weight:bold;");
console.log("%cThere's a hidden command in this game. If your teacher has enabled pranks,",
	"color:#9aa3c7;");
console.log("%cyou can play sounds on other kids' Arduinos. Try this in the console:",
	"color:#9aa3c7;");
console.log("%c  GameAPI.prank('" + code + "', '" + (myName || "YourName") + "', 'TargetName', 880, 600)",
	"color:#5dffa1;font-family:monospace;");
console.log("%c(freq 100-3000 Hz, duration 100-2000 ms; target name is case-insensitive)",
	"color:#9aa3c7;");
console.log("%c");
console.log("%cBut wait — how do you know if pranks are even on? Try this read-only call:",
	"color:#9aa3c7;");
console.log("%c  GameAPI.pranksEnabled('" + code + "').then(r => console.log(r))",
	"color:#5dffa1;font-family:monospace;");
console.log("%cIt returns { enabled: true|false }. No password needed — anyone can ask.",
	"color:#9aa3c7;");
console.log("%cReal IoT devices often expose 'harmless' read endpoints like this. Attackers",
	"color:#9aa3c7;");
console.log("%cuse them to scan for vulnerable targets before launching the actual attack.",
	"color:#9aa3c7;");
console.log("%c");
console.log("%cThis is what hackers do every day: they read app source code and call APIs",
	"color:#ffcb47;");
console.log("%cdirectly, bypassing the official UI. ANY device that exposes a network",
	"color:#ffcb47;");
console.log("%cinterface can be poked at this way. That's why authentication and limits matter.",
	"color:#ffcb47;");

GameEmoji.build("emojiBar", function (emoji) {
	if (!myName) return;
	GameAPI.sendEmoji(code, myName, emoji).catch(function () {});
});

initialFetch();
