// Board test page: connect Arduino, exercise each component, watch inputs.

const status = document.getElementById("serialStatus");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const log = document.getElementById("serialLog");
const toast = document.getElementById("toast");
const btnIndicator = document.getElementById("btnIndicator");
const swIndicator = document.getElementById("swIndicator");
const btnLastEvent = document.getElementById("btnLastEvent");
const swLastEvent = document.getElementById("swLastEvent");
const btnPressCount = document.getElementById("btnPressCount");
const swToggleCount = document.getElementById("swToggleCount");
const autoStatus = document.getElementById("autoStatus");

let pressCount = 0;
let toggleCount = 0;

function showToast (msg) {
	toast.textContent = msg;
	toast.classList.add("show");
	clearTimeout(showToast._tid);
	showToast._tid = setTimeout(function () { toast.classList.remove("show"); }, 1800);
}

function logLine (line, dir) {
	const arrow = dir === "in" ? "<-" : "->";
	log.textContent += arrow + " " + line + "\n";
	log.scrollTop = log.scrollHeight;
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

ArduinoSerial.setOnLine(function (line) {
	logLine(line, "in");
	if (line === "BTN:PRESS") {
		btnIndicator.style.background = "var(--good)";
		btnLastEvent.textContent = "PRESS @ " + new Date().toLocaleTimeString();
		pressCount++;
		btnPressCount.textContent = String(pressCount);
	} else if (line === "BTN:RELEASE") {
		btnIndicator.style.background = "#444";
		btnLastEvent.textContent = "RELEASE @ " + new Date().toLocaleTimeString();
	} else if (line === "SW:UP") {
		swIndicator.style.background = "var(--accent)";
		swLastEvent.textContent = "UP @ " + new Date().toLocaleTimeString();
		toggleCount++;
		swToggleCount.textContent = String(toggleCount);
	} else if (line === "SW:DOWN") {
		swIndicator.style.background = "var(--accent-2)";
		swLastEvent.textContent = "DOWN @ " + new Date().toLocaleTimeString();
		toggleCount++;
		swToggleCount.textContent = String(toggleCount);
	} else if (line === "READY") {
		showToast("Arduino said READY ✓");
	}
});
ArduinoSerial.setOnClose(function () {
	if (connectBtn.disabled) return;
	setUiDisconnected("disconnected", true);
	connectBtn.textContent = "Reconnect Arduino";
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
		showToast("Connected. Running quick blink + beep...");
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
	if (!ArduinoSerial.isConnected()) return setUiDisconnected();
	disconnectBtn.disabled = true;
	try { await ArduinoSerial.disconnect(); } catch (e) {}
	setUiDisconnected();
	disconnectBtn.disabled = false;
}

connectBtn.addEventListener("click", doConnect);
disconnectBtn.addEventListener("click", doDisconnect);

ArduinoSerial.tryAutoReconnect(9600).then(function (ok) {
	if (ok) setUiConnected();
});

// ---------- LED ----------
function send (cmd) {
	if (!ArduinoSerial.isConnected()) {
		showToast("Connect the Arduino first.");
		return false;
	}
	logLine(cmd, "out");
	return true;
}

document.getElementById("ledOnBtn").addEventListener("click", function () {
	if (send("LED:ON")) ArduinoSerial.ledOn();
});
document.getElementById("ledOffBtn").addEventListener("click", function () {
	if (send("LED:OFF")) ArduinoSerial.ledOff();
});
document.getElementById("ledBlinkBtn").addEventListener("click", async function () {
	if (!ArduinoSerial.isConnected()) { showToast("Connect first."); return; }
	for (let i = 0; i < 5; i++) {
		logLine("LED:ON", "out"); await ArduinoSerial.ledOn();
		await new Promise(function (r) { setTimeout(r, 150); });
		logLine("LED:OFF", "out"); await ArduinoSerial.ledOff();
		await new Promise(function (r) { setTimeout(r, 150); });
	}
});

// ---------- Buzzer ----------
document.querySelectorAll("[data-tone]").forEach(function (b) {
	b.addEventListener("click", async function () {
		const f = parseInt(b.getAttribute("data-tone"), 10);
		if (!send("BUZZ:" + f)) return;
		await ArduinoSerial.buzz(f);
		setTimeout(function () { logLine("BUZZ:OFF", "out"); ArduinoSerial.buzzOff(); }, 600);
	});
});
document.getElementById("buzzOffBtn").addEventListener("click", function () {
	if (send("BUZZ:OFF")) ArduinoSerial.buzzOff();
});
document.getElementById("scaleBtn").addEventListener("click", async function () {
	if (!ArduinoSerial.isConnected()) { showToast("Connect first."); return; }
	const notes = [262, 294, 330, 349, 392, 440, 494, 523]; // C major scale
	for (const f of notes) {
		logLine("BUZZ:" + f, "out");
		await ArduinoSerial.buzz(f);
		await new Promise(function (r) { setTimeout(r, 220); });
	}
	logLine("BUZZ:OFF", "out");
	ArduinoSerial.buzzOff();
});

const freqSlider = document.getElementById("freqSlider");
const freqLabel = document.getElementById("freqLabel");
freqSlider.addEventListener("input", function () { freqLabel.textContent = freqSlider.value; });
document.getElementById("freqPlayBtn").addEventListener("click", async function () {
	const f = parseInt(freqSlider.value, 10);
	if (!send("BUZZ:" + f)) return;
	await ArduinoSerial.buzz(f);
	setTimeout(function () { logLine("BUZZ:OFF", "out"); ArduinoSerial.buzzOff(); }, 600);
});

// ---------- Counters ----------
document.getElementById("resetCountsBtn").addEventListener("click", function () {
	pressCount = 0; toggleCount = 0;
	btnPressCount.textContent = "0";
	swToggleCount.textContent = "0";
	btnLastEvent.textContent = "no events yet";
	swLastEvent.textContent = "no events yet";
});

// ---------- ATTACK ----------
document.getElementById("attackBtn").addEventListener("click", async function () {
	if (!send("ATTACK:1500")) return;
	await ArduinoSerial.attack(1500);
});

// ---------- Auto test ----------
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
async function runAuto () {
	if (!ArduinoSerial.isConnected()) { showToast("Connect first."); return; }
	const btn = document.getElementById("autoBtn");
	btn.disabled = true;
	const startPress = pressCount;
	try {
		autoStatus.textContent = "Step 1/4: blinking LED...";
		for (let i = 0; i < 3; i++) {
			logLine("LED:ON", "out"); await ArduinoSerial.ledOn(); await sleep(180);
			logLine("LED:OFF", "out"); await ArduinoSerial.ledOff(); await sleep(180);
		}

		autoStatus.textContent = "Step 2/4: rising tones...";
		for (const f of [440, 660, 880, 1320]) {
			logLine("BUZZ:" + f, "out"); await ArduinoSerial.buzz(f); await sleep(180);
		}
		logLine("BUZZ:OFF", "out"); await ArduinoSerial.buzzOff();

		autoStatus.textContent = "Step 3/4: ATTACK pulse (LED on + 880 Hz, 1.2 s)";
		logLine("ATTACK:1200", "out");
		await ArduinoSerial.attack(1200);
		await sleep(1400);

		autoStatus.textContent = "Step 4/4: press the button within 5s...";
		const deadline = Date.now() + 5000;
		while (pressCount === startPress && Date.now() < deadline) await sleep(100);
		if (pressCount > startPress) {
			autoStatus.innerHTML = '<span style="color:var(--good);">✓ All tests passed.</span>';
		} else {
			autoStatus.innerHTML = '<span style="color:var(--bad);">✗ No button press detected. Check D2 ↔ GND wiring.</span>';
		}
	} finally {
		btn.disabled = false;
	}
}
document.getElementById("autoBtn").addEventListener("click", runAuto);
