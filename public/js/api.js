window.GameAPI = (function () {
	async function call (path, body) {
		const res = await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body || {})
		});
		if (!res.ok) {
			let txt = await res.text();
			try { txt = JSON.parse(txt).error || txt; } catch (e) {}
			throw new Error(txt || ("HTTP " + res.status));
		}
		return await res.json();
	}
	return {
		// ---- open / player endpoints (no auth) ----
		listNames:        (code)            => call("/v1/game/list_names",   { code }),
		lobbyState:       (code)            => call("/v1/game/lobby_state",  { code }),
		join:             (code, name)      => call("/v1/game/join",         { code, name }),
		leave:            (code, name)      => call("/v1/game/leave",        { code, name }),
		reportHit:        (code, name, id)  => call("/v1/game/report_hit",   { code, name, attackId: id }),
		reportMiss:       (code, name, id)  => call("/v1/game/report_miss",  { code, name, attackId: id }),
		listLobbies:      ()                => call("/v1/game/list_lobbies"),
		createLobby:      ()                => call("/v1/game/create_lobby"),
		setArduinoStatus: (code, name, connected) => call("/v1/game/set_arduino_status", { code, name, connected }),
		sendEmoji:        (code, name, emoji)     => call("/v1/game/send_emoji",          { code, name, emoji }),
		reportEarlyPress: (code, name)            => call("/v1/game/report_early_press",  { code, name }),
		pranksEnabled:    (code)                  => call("/v1/game/pranks_enabled",      { code }),
		prank: (code, from, target, freq, durationMs) => call("/v1/game/prank", { code, from, target, freq, durationMs }),

		// ---- teacher-only endpoints (require teacherToken from create_lobby) ----
		deleteLobby:         (code, t)              => call("/v1/game/delete_lobby",          { code, teacherToken: t }),
		lobbyDetail:         (code, t)              => call("/v1/game/lobby_detail",          { code, teacherToken: t }),
		addName:             (code, t, name)        => call("/v1/game/add_name",              { code, teacherToken: t, name }),
		removeName:          (code, t, name)        => call("/v1/game/remove_name",           { code, teacherToken: t, name }),
		startGame:           (code, t)              => call("/v1/game/start_game",            { code, teacherToken: t }),
		resetGame:           (code, t)              => call("/v1/game/reset_game",            { code, teacherToken: t }),
		revivePlayer:        (code, t, name)        => call("/v1/game/revive_player",         { code, teacherToken: t, name }),
		sendMessage:         (code, t, text)        => call("/v1/game/send_message",          { code, teacherToken: t, text }),
		setPlayerPaused:     (code, t, name, p)     => call("/v1/game/set_player_paused",     { code, teacherToken: t, name, paused: p }),
		setPlayerDifficulty: (code, t, name, diff)  => call("/v1/game/set_player_difficulty", { code, teacherToken: t, name, difficulty: diff }),
		setBlockButton:      (code, t, name, en)    => call("/v1/game/set_block_button",      { code, teacherToken: t, name, enabled: en }),
		setPranksEnabled:    (code, t, en)          => call("/v1/game/set_pranks_enabled",    { code, teacherToken: t, enabled: en })
	};
})();
