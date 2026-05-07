const params = new URLSearchParams(location.search);
const prefilledCode = (params.get("code") || "").trim();

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const codeInput = document.getElementById("codeInput");
const codeErr = document.getElementById("codeErr");
const nameErr = document.getElementById("nameErr");
const namesGrid = document.getElementById("namesGrid");
const step2Code = document.getElementById("step2Code");

let activeCode = null;

codeInput.addEventListener("input", function () {
	codeInput.value = codeInput.value.replace(/[^0-9]/g, "").slice(0, 5);
});

document.getElementById("codeForm").addEventListener("submit", goToStep2);
document.getElementById("codeBtn").addEventListener("click", goToStep2);
document.getElementById("backBtn").addEventListener("click", goToStep1);

async function goToStep2 () {
	const code = (codeInput.value || "").trim();
	codeErr.textContent = "";
	if (!/^[0-9]{5}$/.test(code)) {
		codeErr.textContent = "Enter a 5-digit code.";
		return;
	}
	try {
		await GameAPI.lobbyState(code);
	} catch (e) {
		codeErr.textContent = "Lobby " + code + " not found. Double-check the code with your teacher.";
		return;
	}
	activeCode = code;
	step2Code.textContent = code;
	step1.style.display = "none";
	step2.style.display = "block";
	GameWS.connect("lobby:" + code);
	GameWS.on("lobby_state", onWsState);
	GameWS.on("lobby_gone", function () {
		nameErr.textContent = "This lobby was deleted. Going back...";
		setTimeout(goToStep1, 1200);
	});
	await refreshNames();
}

function onWsState (state) {
	if (state.phase !== "lobby") {
		nameErr.textContent = "This lobby's game has already started. Pick a different lobby.";
		return;
	}
	// Re-fetch names since state doesn't include them.
	refreshNames();
}

function goToStep1 () {
	activeCode = null;
	GameWS.disconnect();
	step1.style.display = "block";
	step2.style.display = "none";
	codeErr.textContent = "";
	nameErr.textContent = "";
	codeInput.focus();
}

async function refreshNames () {
	if (!activeCode) return;
	let state, names;
	try {
		[state, names] = await Promise.all([
			GameAPI.lobbyState(activeCode),
			GameAPI.listNames(activeCode)
		]);
	} catch (e) {
		nameErr.textContent = "Lobby is gone. Going back...";
		setTimeout(goToStep1, 1200);
		return;
	}
	if (state.phase === "resetting") {
		nameErr.textContent = "This lobby is resetting. Try again in a moment.";
		namesGrid.innerHTML = "";
		return;
	}
	if (state.phase !== "lobby") {
		nameErr.textContent = "Game in progress — you'll wait in the lobby until the next round.";
		nameErr.style.color = "var(--accent)";
	} else {
		nameErr.textContent = "";
		nameErr.style.color = "var(--bad)";
	}
	namesGrid.innerHTML = names.map(function (n) {
		const cls = "name-tile" + (n.taken ? " taken" : "");
		return '<div class="' + cls + '" data-name="' + n.name + '">' + n.name + '</div>';
	}).join('');
	namesGrid.querySelectorAll(".name-tile").forEach(function (el) {
		el.addEventListener("click", function () {
			pickName(el.getAttribute("data-name"), el);
		});
	});
}

async function pickName (name, el) {
	if (!activeCode) return;
	if (el && el.classList.contains("taken")) return;
	nameErr.textContent = "";
	try {
		await GameAPI.join(activeCode, name);
		localStorage.setItem("arduinoboss_name_" + activeCode, name);
		localStorage.setItem("arduinoboss_last_code", activeCode);
		GameWS.disconnect();
		location.href = "/lobby.hott?code=" + encodeURIComponent(activeCode);
	} catch (e) {
		nameErr.textContent = e.message || "Could not join.";
		await refreshNames();
	}
}

if (/^[0-9]{5}$/.test(prefilledCode)) {
	codeInput.value = prefilledCode;
	goToStep2();
} else {
	codeInput.focus();
}
