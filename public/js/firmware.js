(function () {
	const codeBlock = document.getElementById("codeBlock");
	const copyBtn = document.getElementById("copyBtn");
	const status = document.getElementById("copyStatus");

	let code = "";
	let statusTimer = null;

	function setStatus(msg, color) {
		status.textContent = msg;
		status.style.color = color || "var(--ink-dim)";
		if (statusTimer) clearTimeout(statusTimer);
		if (msg) statusTimer = setTimeout(() => { status.textContent = ""; }, 2500);
	}

	fetch("/ArduinoBoss.ino", { cache: "no-cache" })
		.then(r => {
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.text();
		})
		.then(text => {
			code = text;
			codeBlock.textContent = text;
		})
		.catch(err => {
			codeBlock.textContent = "Could not load the Arduino code: " + err.message;
			codeBlock.style.color = "var(--bad)";
			copyBtn.disabled = true;
		});

	copyBtn.addEventListener("click", async () => {
		if (!code) return;
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(code);
			} else {
				const range = document.createRange();
				range.selectNodeContents(codeBlock);
				const sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
				document.execCommand("copy");
				sel.removeAllRanges();
			}
			setStatus("Copied!", "var(--good)");
		} catch (err) {
			setStatus("Copy failed — select the code and press Ctrl+C.", "var(--bad)");
		}
	});
})();
