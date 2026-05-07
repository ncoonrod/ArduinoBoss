// Spectator / big-screen view. Read-only — no buttons, no Arduino, no defense logic.
// Designed to mirror what every player sees while playing, in a single fullscreen tab.

function readCode () {
	try {
		const params = new URLSearchParams(location.search);
		const fromUrl = (params.get("code") || "").trim();
		if (/^[0-9]{5}$/.test(fromUrl)) return fromUrl;
	} catch (e) {}
	return "";
}

const code = readCode();
if (!code) {
	document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#fff;font-size:24px;">Open this page with ?code=XXXXX</div>';
	throw new Error("no code");
}

document.getElementById("codeLabel").textContent = code;
document.getElementById("bossSlot").innerHTML = window.BOSS_SVG;

let lastBossHp = null;
let lastState = null;
let lastPhase = null;
let countdownTimer = null;
let bossActionTimer = null;
let victoryJinglePlayed = false;
let defeatJinglePlayed = false;

function showToast (msg) {
	const t = document.getElementById("toast");
	t.textContent = msg;
	t.classList.add("show");
	clearTimeout(showToast._tid);
	showToast._tid = setTimeout(function () { t.classList.remove("show"); }, 2000);
}

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

function flashBoss () {
	const svg = document.querySelector(".boss-svg");
	if (!svg) return;
	svg.classList.add("hurt");
	setTimeout(function () { svg.classList.remove("hurt"); }, 500);
}

function setBossDead (isDead) {
	const svg = document.querySelector(".boss-svg");
	if (!svg) return;
	if (isDead) svg.classList.add("dead");
	else svg.classList.remove("dead");
}

function flashScreenRed () {
	const el = document.createElement("div");
	el.className = "hit-flash";
	document.body.appendChild(el);
	setTimeout(function () { el.remove(); }, 500);
}

function playBossHitSound () {
	beep(880, 80, "square");
	setTimeout(function () { beep(560, 110, "sawtooth"); }, 70);
}

function playPlayerHitSound () {
	beep(150, 250, "square");
}

async function playVictoryJingle () {
	const notes = [[523, 160], [659, 160], [784, 160], [1046, 240], [784, 100], [1046, 360]];
	for (const [f, d] of notes) {
		beep(f, d, "triangle");
		await new Promise(function (r) { setTimeout(r, d + 50); });
	}
}

async function playDefeatJingle () {
	const notes = [[392, 240], [330, 240], [262, 480]];
	for (const [f, d] of notes) {
		beep(f, d, "sawtooth");
		await new Promise(function (r) { setTimeout(r, d + 60); });
	}
}

function renderPlayerCards (state) {
	const cards = document.getElementById("playerCards");
	const targetName = state.currentAttack ? state.currentAttack.target : null;
	const active = state.players.filter(function (p) { return !p.waiting; });
	if (active.length === 0) {
		cards.innerHTML = '<div class="dim" style="text-align:center;font-size:18px;padding:14px;">Waiting for players to join...</div>';
		return;
	}
	cards.innerHTML = active.map(function (p) {
		const isTarget = p.name === targetName;
		const isDead = p.hp <= 0;
		const cls = ["player-card"];
		if (isTarget) cls.push("target");
		if (isDead) cls.push("dead");
		const hearts = [];
		for (let i = 0; i < p.maxHp; i++) {
			hearts.push('<div class="heart' + (i < p.hp ? '' : ' lost') + '"></div>');
		}
		let extras = '';
		if (!p.connected) extras += ' <span class="dim" style="font-size:12px;">(offline)</span>';
		if (p.paused) extras += ' <span style="color:#7ad8ff;font-size:12px;">⏸ paused</span>';
		if (p.arduinoConnected) extras += ' <span style="color:var(--good);font-size:12px;">⚡</span>';
		return '<div class="' + cls.join(' ') + '" data-name="' + p.name + '">'
			+ '<div class="pc-name"><span>' + p.name + extras + '</span>'
			+ '<span class="pc-score">' + p.score + ' pts</span></div>'
			+ '<div class="hp-row">' + hearts.join('') + '</div>'
			+ '</div>';
	}).join('');
}

function renderCountdown (state) {
	const overlay = document.getElementById("countdownOverlay");
	const label = document.getElementById("countdownLabel");
	const number = document.getElementById("countdownNumber");
	const sub = document.getElementById("countdownSub");
	if (!state || !state.transition) {
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
		sub.textContent = "Sending everyone back to the lobby...";
	}
	const localStart = Date.now();
	const remainingAtState = state.transition.endsAt - state.serverTime;
	function tick () {
		const remaining = remainingAtState - (Date.now() - localStart);
		number.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
		if (remaining <= 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
	}
	tick();
	if (countdownTimer) clearInterval(countdownTimer);
	countdownTimer = setInterval(tick, 200);
}

function renderBossAction () {
	const card = document.getElementById("bossActionCard");
	const inner = document.getElementById("bossActionInner");
	if (!lastState || lastState.phase !== "playing") {
		card.style.display = "none";
		return;
	}
	const a = lastState.currentAttack;
	const n = lastState.nextAttack;
	const skewMs = Date.now() - lastState.serverTime;
	function nowServer () { return Date.now() - skewMs; }
	if (a) {
		const remaining = Math.max(0, (a.startedAt + a.durationMs) - nowServer());
		const pct = 100 * remaining / a.durationMs;
		card.style.display = "block";
		inner.innerHTML = '<div class="boss-action attacking">'
			+ '<span class="label">Attacking</span>'
			+ '<span class="target-name">' + a.target + '</span>'
			+ '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>'
			+ '<span class="countdown">' + (remaining / 1000).toFixed(1) + 's</span>'
			+ '</div>';
	} else if (n) {
		const total = n.scheduledAt - lastState.serverTime;
		const remaining = Math.max(0, n.scheduledAt - nowServer());
		const pct = total > 0 ? 100 * (1 - remaining / total) : 100;
		card.style.display = "block";
		inner.innerHTML = '<div class="boss-action">'
			+ '<span class="label">Next attack</span>'
			+ '<span class="target-name">' + n.target + '</span>'
			+ '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>'
			+ '<span class="countdown">' + (remaining / 1000).toFixed(1) + 's</span>'
			+ '</div>';
	} else {
		card.style.display = "block";
		inner.innerHTML = '<div class="boss-action">'
			+ '<span class="label">Next attack</span>'
			+ '<span class="dim">picking a target…</span>'
			+ '</div>';
	}
}

function applyState (state) {
	document.getElementById("bossHpLabel").textContent = state.bossHp + "/" + state.maxBossHp;
	document.getElementById("bossHpFill").style.width = (100 * state.bossHp / state.maxBossHp) + "%";

	if (lastBossHp !== null && state.bossHp < lastBossHp && state.phase !== "victory") {
		flashBoss();
		playBossHitSound();
	}
	lastBossHp = state.bossHp;

	setBossDead(state.phase === "victory");

	// Per-player HP drop on the big screen — flash only the hit player's card.
	const hitNames = [];
	if (lastState) {
		for (const p of state.players) {
			const prev = lastState.players.find(function (x) { return x.name === p.name; });
			if (prev && p.hp < prev.hp) hitNames.push(p.name);
		}
	}

	lastState = state;
	lastPhase = state.phase;

	renderPlayerCards(state);

	if (hitNames.length > 0) {
		playPlayerHitSound();
		const cards = document.getElementById("playerCards");
		hitNames.forEach(function (name) {
			const card = cards.querySelector('[data-name="' + CSS.escape(name) + '"]');
			if (card) {
				card.classList.remove("card-hit");
				// Force reflow so the animation restarts on rapid sequential hits.
				void card.offsetWidth;
				card.classList.add("card-hit");
			}
		});
	}
	renderCountdown(state);
	renderBossAction();

	const phaseMsg = document.getElementById("phaseMsg");
	if (state.phase === "lobby") {
		phaseMsg.textContent = "Waiting in the lobby. Teacher must press Start.";
	} else if (state.phase === "starting") {
		phaseMsg.textContent = "";
	} else if (state.phase === "resetting") {
		phaseMsg.textContent = "";
	} else if (state.phase === "playing") {
		victoryJinglePlayed = false;
		defeatJinglePlayed = false;
		phaseMsg.textContent = state.currentAttack
			? "Boss is attacking " + state.currentAttack.target + "!"
			: "Boss is preparing the next attack...";
	} else if (state.phase === "victory") {
		phaseMsg.innerHTML = '<div class="banner victory">VICTORY!</div>';
		if (!victoryJinglePlayed) { victoryJinglePlayed = true; playVictoryJingle(); }
	} else if (state.phase === "defeat") {
		phaseMsg.innerHTML = '<div class="banner defeat">DEFEAT</div>';
		if (!defeatJinglePlayed) { defeatJinglePlayed = true; playDefeatJingle(); }
	}
}

async function initialFetch () {
	try {
		const state = await GameAPI.lobbyState(code);
		applyState(state);
	} catch (e) {
		showToast("Lobby not found.");
	}
}

GameWS.connect("lobby:" + code);
GameWS.on("lobby_state", applyState);
GameWS.on("lobby_gone", function () {
	showToast("This lobby was deleted.");
});
GameWS.on("emoji", function (data) {
	if (data && data.emoji) GameEmoji.spawn(data.name, data.emoji);
});
GameWS.on("teacher_message", function (data) {
	if (data && data.text) GameEmoji.announce(data.text);
});

bossActionTimer = setInterval(renderBossAction, 100);
initialFetch();
