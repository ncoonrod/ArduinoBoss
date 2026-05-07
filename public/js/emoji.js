// Emoji reaction module: build the clickable emoji bar and handle incoming reactions.
window.GameEmoji = (function () {
	const EMOJIS = ["🎉", "❤️", "😂", "👍", "🔥", "💪", "⚔️", "🛡️", "😮", "🏆"];

	function build (containerId, sendFn) {
		const el = document.getElementById(containerId);
		if (!el) return;
		el.classList.add("emoji-bar");
		el.innerHTML = EMOJIS.map(function (e) {
			return '<button class="emoji-btn" type="button" data-emoji="' + e + '">' + e + '</button>';
		}).join('');
		let lastSent = 0;
		el.querySelectorAll(".emoji-btn").forEach(function (btn) {
			btn.addEventListener("click", function () {
				const now = Date.now();
				if (now - lastSent < 600) return; // simple per-client throttle
				lastSent = now;
				const emoji = btn.getAttribute("data-emoji");
				try { sendFn(emoji); } catch (e) {}
			});
		});
	}

	function announce (text) {
		const el = document.createElement("div");
		el.className = "teacher-banner";
		const lbl = document.createElement("span");
		lbl.className = "tb-label";
		lbl.textContent = "Teacher";
		const txt = document.createElement("span");
		txt.textContent = text || "";
		el.appendChild(lbl);
		el.appendChild(txt);
		document.body.appendChild(el);
		setTimeout(function () { el.remove(); }, 5200);
	}

	function spawn (name, emoji) {
		const el = document.createElement("div");
		el.className = "emoji-pop";
		// Random horizontal position, biased toward middle 80%.
		const left = 10 + Math.random() * 80;
		// Random vertical start in lower half of viewport.
		const bottom = 60 + Math.random() * 120;
		el.style.left = left + "%";
		el.style.bottom = bottom + "px";
		const nameEl = document.createElement("div");
		nameEl.className = "emoji-name";
		nameEl.textContent = name || "?";
		const iconEl = document.createElement("div");
		iconEl.className = "emoji-icon";
		iconEl.textContent = emoji || "✨";
		el.appendChild(nameEl);
		el.appendChild(iconEl);
		document.body.appendChild(el);
		setTimeout(function () { el.remove(); }, 4000);
	}

	return { build, spawn, announce, EMOJIS };
})();
