const params = new URLSearchParams(location.search);
const focusCode = (params.get("code") || "").trim();

// ---------- Teacher token storage ----------
// We store a map { lobbyCode: token } in sessionStorage so refreshing the
// page or clicking back+Manage keeps the same teacher access. The token
// also rides on the URL (?token=...) so the teacher can copy/share the URL.
const TOKEN_STORE_KEY = "arduinoboss_teacher_tokens";
function readTokenMap () {
	try { return JSON.parse(sessionStorage.getItem(TOKEN_STORE_KEY) || "{}"); }
	catch (e) { return {}; }
}
function saveToken (code, token) {
	const m = readTokenMap();
	m[code] = token;
	sessionStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(m));
}
function getToken (code) {
	if (!code) return "";
	// URL takes priority — explicit override survives across browsers.
	const fromUrl = (params.get("token") || "").trim();
	if (fromUrl) {
		saveToken(code, fromUrl);
		return fromUrl;
	}
	return readTokenMap()[code] || "";
}
function manageUrlFor (code) {
	const t = getToken(code);
	return "/teacher.hott?code=" + encodeURIComponent(code) + (t ? "&token=" + encodeURIComponent(t) : "");
}

const teacherToken = getToken(focusCode);

function showToast (msg) {
	const t = document.getElementById("toast");
	t.textContent = msg;
	t.classList.add("show");
	clearTimeout(showToast._tid);
	showToast._tid = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function showView () {
	if (focusCode) {
		document.getElementById("detailView").style.display = "block";
		document.getElementById("listView").style.display = "none";
		document.getElementById("pageTitle").textContent = "Manage Lobby";
		bootDetail();
	} else {
		document.getElementById("detailView").style.display = "none";
		document.getElementById("listView").style.display = "block";
		document.getElementById("pageTitle").textContent = "Teacher";
		bootList();
	}
}

function renderList (lobbies) {
	const body = document.getElementById("lobbiesBody");
	const noEl = document.getElementById("noLobbies");
	if (!lobbies || lobbies.length === 0) {
		body.innerHTML = "";
		noEl.style.display = "block";
	} else {
		noEl.style.display = "none";
		body.innerHTML = lobbies.map(function (l) {
			const haveToken = !!getToken(l.code);
			const btn = haveToken
				? '<a class="btn" href="' + manageUrlFor(l.code) + '">Manage</a>'
				: '<span class="dim" style="font-size:11px;">no teacher access</span>';
			return '<tr style="border-top:1px solid var(--bg-1);">'
				+ '<td style="padding:8px;font-size:22px;letter-spacing:3px;color:var(--accent);font-weight:bold;">' + l.code + '</td>'
				+ '<td style="padding:8px;">' + l.phase + '</td>'
				+ '<td style="padding:8px;">' + l.playerCount + '</td>'
				+ '<td style="padding:8px;">' + l.approvedNameCount + '</td>'
				+ '<td style="padding:8px;text-align:right;">' + btn + '</td></tr>';
		}).join('');
	}
}

async function bootList () {
	GameWS.connect("teacher");
	GameWS.on("lobbies_list", function (data) { renderList(data.lobbies); });
	try {
		const res = await GameAPI.listLobbies();
		renderList(res.lobbies);
	} catch (e) {}
}

document.getElementById("createBtn").addEventListener("click", async function () {
	try {
		const res = await GameAPI.createLobby();
		// Save the one-shot teacher token so we can authorize subsequent calls.
		saveToken(res.code, res.teacherToken);
		showToast("Created lobby " + res.code);
		location.href = "/teacher.hott?code=" + encodeURIComponent(res.code)
			+ "&token=" + encodeURIComponent(res.teacherToken);
	} catch (e) { showToast(e.message); }
});

document.getElementById("detailCode").textContent = focusCode || "-----";
document.getElementById("shareCode").textContent = focusCode || "-----";
const specLink = document.getElementById("spectatorLink");
if (specLink && focusCode) specLink.href = "/spectator.hott?code=" + encodeURIComponent(focusCode);

let lastDetail = null;
let lastState = null;
let removalTickTimer = null;
let bossActionTimer = null;

function startRemovalTicker () {
	if (removalTickTimer) return;
	removalTickTimer = setInterval(function () {
		const els = document.querySelectorAll("[data-disconnected-at]");
		if (els.length === 0) {
			clearInterval(removalTickTimer); removalTickTimer = null;
			return;
		}
		const now = Date.now();
		els.forEach(function (el) {
			const at = parseInt(el.getAttribute("data-disconnected-at"), 10);
			if (!at) return;
			el.textContent = String(Math.max(0, Math.ceil((at + 2000 - now) / 1000)));
		});
	}, 200);
}

function renderDetail (data) {
	lastDetail = data;
	document.getElementById("detailPhase").textContent = data.phase;

	const pl = document.getElementById("playersList");
	if (data.players.length === 0) {
		pl.innerHTML = '<li class="empty">No one yet.</li>';
	} else {
		pl.innerHTML = data.players.map(function (p) {
			const maxHp = p.maxHp || 0;
			const hp = typeof p.hp === "number" ? p.hp : maxHp;
			const hearts = [];
			for (let i = 0; i < maxHp; i++) {
				hearts.push('<div class="heart' + (i < hp ? '' : ' lost') + '"></div>');
			}
			const waiting = !!p.waiting;
			const offline = p.connected === false;
			const dead = !waiting && hp <= 0;
			const score = p.score || 0;

			const badges = [];
			const paused = !!p.paused;
			if (p.arduinoConnected) {
				badges.push('<span style="color:var(--good);font-size:11px;border:1px solid var(--good);border-radius:4px;padding:1px 6px;">⚡ Arduino</span>');
			} else {
				badges.push('<span class="dim" style="font-size:11px;border:1px solid var(--ink-dim);border-radius:4px;padding:1px 6px;">no Arduino</span>');
			}
			if (waiting) badges.push('<span style="color:var(--accent);font-size:11px;border:1px solid var(--accent);border-radius:4px;padding:1px 6px;">waiting next round</span>');
			if (paused) badges.push('<span style="color:#7ad8ff;font-size:11px;border:1px solid #7ad8ff;border-radius:4px;padding:1px 6px;">⏸ paused</span>');
			if (dead) badges.push('<span class="dim" style="font-size:11px;">(out)</span>');
			if (offline && p.disconnectedAt) {
				badges.push('<span style="color:var(--bad);font-size:11px;border:1px solid var(--bad);border-radius:4px;padding:1px 6px;">offline (removing in <span data-disconnected-at="' + p.disconnectedAt + '">2</span>s)</span>');
			} else if (offline) {
				badges.push('<span style="color:var(--bad);font-size:11px;border:1px solid var(--bad);border-radius:4px;padding:1px 6px;">offline</span>');
			}

			const reviveBtn = (dead && !waiting)
				? '<button class="btn" style="padding:4px 10px;font-size:12px;background:linear-gradient(180deg,#5dffa1,#2c8b54);color:#08200f;box-shadow:0 3px 0 #1a5234;" data-revive="' + p.name + '">Revive</button>'
				: '';
			const pauseBtn = !waiting
				? (paused
					? '<button class="btn" style="padding:4px 10px;font-size:12px;background:linear-gradient(180deg,#7ad8ff,#2780a8);color:#001f33;box-shadow:0 3px 0 #0d4f6b;" data-resume="' + p.name + '">▶ Resume</button>'
					: '<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" data-pause="' + p.name + '">⏸ Pause</button>')
				: '';
			const blockOn = !!p.blockButtonEnabled;
			const blockBtn = !waiting
				? (blockOn
					? '<button class="btn" style="padding:4px 10px;font-size:12px;background:linear-gradient(180deg,#ffcb47,#a36300);color:#221500;box-shadow:0 3px 0 #6a4a00;" data-block-off="' + p.name + '">🛡️ Block on</button>'
					: '<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" data-block-on="' + p.name + '">🛡️ Show Block</button>')
				: '';
			const diff = p.difficulty || "hard";
			const diffSel = '<select data-difficulty="' + p.name + '" style="padding:3px 6px;font-size:12px;background:var(--bg-1);color:var(--ink);border:1px solid var(--bg-2);border-radius:6px;">'
				+ '<option value="easy"' + (diff === "easy" ? " selected" : "") + '>Easy</option>'
				+ '<option value="normal"' + (diff === "normal" ? " selected" : "") + '>Normal</option>'
				+ '<option value="hard"' + (diff === "hard" ? " selected" : "") + '>Hard</option>'
				+ '</select>';
			const opacity = (dead || waiting || paused) ? ' style="opacity:0.7;"' : '';
			const hpDisplay = waiting
				? '<span class="dim" style="font-size:13px;">—</span>'
				: '<div class="hp-row" style="display:flex;gap:3px;">' + hearts.join('') + '</div>'
					+ '<span class="dim" style="font-size:13px;">' + hp + '/' + maxHp + ' HP</span>';

			return '<li' + opacity + '>'
				+ '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">'
				+ '<b style="min-width:80px;">' + p.name + '</b>'
				+ '<span class="dim" style="font-size:13px;">' + score + ' pts</span>'
				+ hpDisplay
				+ badges.join(' ')
				+ '<span class="dim" style="font-size:11px;">Diff:</span>' + diffSel
				+ blockBtn
				+ reviveBtn
				+ pauseBtn
				+ '</div>'
				+ '</li>';
		}).join('');

		pl.querySelectorAll("[data-revive]").forEach(function (btn) {
			btn.addEventListener("click", async function () {
				const name = btn.getAttribute("data-revive");
				try {
					await GameAPI.revivePlayer(focusCode, teacherToken, name);
					showToast("Revived " + name);
				} catch (e) { showToast(e.message); }
			});
		});

		pl.querySelectorAll("[data-pause]").forEach(function (btn) {
			btn.addEventListener("click", async function () {
				const name = btn.getAttribute("data-pause");
				try {
					await GameAPI.setPlayerPaused(focusCode, teacherToken, name, true);
					showToast("Paused " + name);
				} catch (e) { showToast(e.message); }
			});
		});

		pl.querySelectorAll("[data-resume]").forEach(function (btn) {
			btn.addEventListener("click", async function () {
				const name = btn.getAttribute("data-resume");
				try {
					await GameAPI.setPlayerPaused(focusCode, teacherToken, name, false);
					showToast("Resumed " + name);
				} catch (e) { showToast(e.message); }
			});
		});

		pl.querySelectorAll("[data-block-on]").forEach(function (btn) {
			btn.addEventListener("click", async function () {
				const name = btn.getAttribute("data-block-on");
				try {
					await GameAPI.setBlockButton(focusCode, teacherToken, name, true);
					showToast("Block button shown for " + name);
				} catch (e) { showToast(e.message); }
			});
		});
		pl.querySelectorAll("[data-block-off]").forEach(function (btn) {
			btn.addEventListener("click", async function () {
				const name = btn.getAttribute("data-block-off");
				try {
					await GameAPI.setBlockButton(focusCode, teacherToken, name, false);
					showToast("Block button hidden for " + name);
				} catch (e) { showToast(e.message); }
			});
		});

		pl.querySelectorAll("[data-difficulty]").forEach(function (sel) {
			sel.addEventListener("change", async function () {
				const name = sel.getAttribute("data-difficulty");
				const diff = sel.value;
				try {
					await GameAPI.setPlayerDifficulty(focusCode, teacherToken, name, diff);
					showToast(name + " → " + diff);
				} catch (e) { showToast(e.message); }
			});
		});

		startRemovalTicker();
	}

	const grid = document.getElementById("namesGrid");
	const taken = new Set(data.players.map(function (p) { return p.name; }));
	grid.innerHTML = data.names.map(function (n) {
		const isTaken = taken.has(n);
		return '<div class="name-tile ' + (isTaken ? "mine" : "") + '" data-name="' + n + '">'
			+ n
			+ '<div class="dim" style="font-size:11px;">' + (isTaken ? "joined" : "open") + '</div>'
			+ '<button class="btn btn-danger" style="padding:2px 8px;font-size:11px;margin-top:4px;" data-remove="' + n + '">Remove</button>'
			+ '</div>';
	}).join('');

	grid.querySelectorAll("[data-remove]").forEach(function (btn) {
		btn.addEventListener("click", async function (e) {
			e.stopPropagation();
			const name = btn.getAttribute("data-remove");
			if (!confirm("Remove " + name + " from this lobby's approved names?")) return;
			try {
				await GameAPI.removeName(focusCode, teacherToken, name);
			} catch (err) { showToast(err.message); }
		});
	});
}

async function fetchDetail () {
	if (!focusCode) return;
	try {
		const data = await GameAPI.lobbyDetail(focusCode, teacherToken);
		renderDetail(data);
	} catch (e) {
		const msg = (e && e.message) || "";
		if (/teacher token|Not authorized/i.test(msg)) {
			showTeacherAccessDenied();
		} else {
			showToast("Lobby " + focusCode + " no longer exists.");
			setTimeout(function () { location.href = "/teacher.hott"; }, 1200);
		}
	}
}

function showTeacherAccessDenied () {
	const detail = document.getElementById("detailView");
	if (!detail) return;
	detail.innerHTML = '<div class="card" style="border:2px solid var(--bad);">'
		+ '<h2>Not your lobby</h2>'
		+ '<p class="dim">You don\'t have a teacher token for lobby <b>' + focusCode + '</b>.</p>'
		+ '<p class="dim">Open this lobby from the same browser that created it, or from the original URL the creator copied (which contains the token).</p>'
		+ '<a class="btn" href="/teacher.hott">← All Lobbies</a>'
		+ '</div>';
}

let countdownTimer = null;

function renderCountdown (state) {
	const overlay = document.getElementById("countdownOverlay");
	const label = document.getElementById("countdownLabel");
	const number = document.getElementById("countdownNumber");
	const sub = document.getElementById("countdownSub");
	if (!overlay) return;

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
		const elapsed = Date.now() - localStart;
		const remaining = remainingAtState - elapsed;
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
	if (!card || !inner) return;
	if (!lastState || lastState.phase !== "playing") {
		card.style.display = "none";
		if (bossActionTimer) { clearInterval(bossActionTimer); bossActionTimer = null; }
		return;
	}
	const a = lastState.currentAttack;
	const n = lastState.nextAttack;
	const skewMs = Date.now() - lastState.serverTime; // local clock − server clock
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
		const total = n.scheduledAt - lastState.serverTime; // total wait window
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

function startBossActionTicker () {
	if (bossActionTimer) return;
	bossActionTimer = setInterval(renderBossAction, 100);
}

function renderPranksToggle (state) {
	const toggle = document.getElementById("pranksToggle");
	const statusEl = document.getElementById("pranksStatus");
	if (!toggle || !statusEl) return;
	const enabled = !!(state && state.pranksEnabled);
	if (toggle.checked !== enabled) toggle.checked = enabled;
	statusEl.textContent = enabled
		? "ON — any player can play sounds on any other player's station."
		: "OFF — the prank API rejects calls.";
	statusEl.style.color = enabled ? "var(--accent-2)" : "var(--ink-dim)";
}

async function bootDetail () {
	GameWS.connect("lobby:" + focusCode);
	GameWS.on("lobby_state", function (state) {
		lastState = state;
		renderCountdown(state);
		renderBossAction();
		renderPranksToggle(state);
		fetchDetail();
	});
	GameWS.on("lobby_gone", function () {
		showToast("This lobby was deleted.");
		setTimeout(function () { location.href = "/teacher.hott"; }, 1200);
	});
	GameWS.on("emoji", function (data) {
		if (data && data.emoji) GameEmoji.spawn(data.name, data.emoji);
	});
	GameWS.on("teacher_message", function (data) {
		if (data && data.text) GameEmoji.announce(data.text);
	});
	await fetchDetail();
	try {
		const state = await GameAPI.lobbyState(focusCode);
		lastState = state;
		renderCountdown(state);
		renderBossAction();
		renderPranksToggle(state);
		startBossActionTicker();
	} catch (e) {}

	const pranksToggle = document.getElementById("pranksToggle");
	if (pranksToggle) {
		pranksToggle.addEventListener("change", async function () {
			try {
				await GameAPI.setPranksEnabled(focusCode, teacherToken, pranksToggle.checked);
				showToast(pranksToggle.checked ? "Pranks enabled 🤫" : "Pranks disabled");
			} catch (e) { showToast(e.message); }
		});
	}

	const input = document.getElementById("broadcastInput");
	const btn = document.getElementById("broadcastBtn");
	async function sendBroadcast () {
		const text = (input.value || "").trim();
		if (!text) return;
		btn.disabled = true;
		try {
			await GameAPI.sendMessage(focusCode, teacherToken, text);
			input.value = "";
		} catch (e) { showToast(e.message); }
		finally { btn.disabled = false; }
	}
	btn.addEventListener("click", sendBroadcast);
	input.addEventListener("keydown", function (e) {
		if (e.key === "Enter") sendBroadcast();
	});
}

document.getElementById("startBtn").addEventListener("click", async function () {
	if (!focusCode) return;
	if (lastDetail && lastDetail.players) {
		const noArduino = lastDetail.players
			.filter(function (p) { return !p.waiting && !p.arduinoConnected; })
			.map(function (p) { return p.name; });
		if (noArduino.length > 0) {
			const ok = confirm(
				"These players don't have an Arduino connected:\n\n  " + noArduino.join(", ")
				+ "\n\nThey'll be in the game but won't see lights or hear buzzes on a station. Start anyway?"
			);
			if (!ok) return;
		}
	}
	try {
		await GameAPI.startGame(focusCode, teacherToken);
		showToast("Game started in lobby " + focusCode + "!");
	} catch (e) { showToast(e.message); }
});

document.getElementById("resetBtn").addEventListener("click", async function () {
	if (!focusCode) return;
	if (!confirm("Reset lobby " + focusCode + " back to lobby phase? All players will be kicked.")) return;
	try {
		await GameAPI.resetGame(focusCode, teacherToken);
		showToast("Reset.");
	} catch (e) { showToast(e.message); }
});

document.getElementById("deleteBtn").addEventListener("click", async function () {
	if (!focusCode) return;
	if (!confirm("Delete lobby " + focusCode + "? This cannot be undone.")) return;
	try {
		await GameAPI.deleteLobby(focusCode, teacherToken);
		showToast("Deleted lobby " + focusCode);
		setTimeout(function () { location.href = "/teacher.hott"; }, 600);
	} catch (e) { showToast(e.message); }
});

document.getElementById("addNameBtn").addEventListener("click", async function () {
	if (!focusCode) return;
	const input = document.getElementById("newNameInput");
	const name = input.value.trim();
	if (!name) return;
	try {
		await GameAPI.addName(focusCode, teacherToken, name);
		input.value = "";
	} catch (e) { showToast(e.message); }
});
document.getElementById("newNameInput").addEventListener("keydown", function (e) {
	if (e.key === "Enter") document.getElementById("addNameBtn").click();
});

showView();
