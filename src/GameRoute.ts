import { HotRoute, ServerRequest } from "hotstaq";
import { AppAPI } from "./AppAPI";
import { LobbyManager } from "./GameState";

export class GameRoute extends HotRoute {
	constructor (api: AppAPI) {
		super(api.connection, "game");

		this.addMethod({ "name": "list_names", "onServerExecute": this._listNames,
			"parameters": { "code": { "type": "string", "required": true, "description": "Lobby code." } },
			"description": "Returns the approved name pool with whether each is taken.",
			"returns": "Array of {name, taken}." });

		this.addMethod({ "name": "lobby_state", "onServerExecute": this._lobbyState,
			"parameters": { "code": { "type": "string", "required": true, "description": "Lobby code." } },
			"description": "Returns lobby and game state.",
			"returns": "PublicLobbyState." });

		this.addMethod({ "name": "join", "onServerExecute": this._join,
			"parameters": {
				"code": { "type": "string", "required": true, "description": "Lobby code." },
				"name": { "type": "string", "required": true, "description": "Name to claim." }
			},
			"description": "Claim a name in a lobby.",
			"returns": "Player." });

		this.addMethod({ "name": "leave", "onServerExecute": this._leave,
			"parameters": {
				"code": { "type": "string", "required": true, "description": "Lobby code." },
				"name": { "type": "string", "required": true, "description": "Name to release." }
			},
			"description": "Release a name back to the pool.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "report_hit", "onServerExecute": this._reportHit,
			"parameters": {
				"code":     { "type": "string", "required": true, "description": "Lobby code." },
				"name":     { "type": "string", "required": true, "description": "Player name." },
				"attackId": { "type": "string", "required": true, "description": "Attack id being defended." }
			},
			"description": "Player blocked an attack.",
			"returns": "{ok, reason?}." });

		this.addMethod({ "name": "report_miss", "onServerExecute": this._reportMiss,
			"parameters": {
				"code":     { "type": "string", "required": true, "description": "Lobby code." },
				"name":     { "type": "string", "required": true, "description": "Player name." },
				"attackId": { "type": "string", "required": true, "description": "Attack id missed." }
			},
			"description": "Player missed an attack.",
			"returns": "{ok}." });

		this.addMethod({ "name": "list_lobbies", "onServerExecute": this._listLobbies,
			"parameters": {},
			"description": "List all lobbies.",
			"returns": "{lobbies: [{code, phase, playerCount, approvedNameCount}]}." });

		this.addMethod({ "name": "create_lobby", "onServerExecute": this._createLobby,
			"parameters": {},
			"description": "Create a new lobby with a fresh 5-digit code. Returns the teacher token used to authorize all teacher-only endpoints for this lobby.",
			"returns": "{code, teacherToken}." });

		this.addMethod({ "name": "delete_lobby", "onServerExecute": this._deleteLobby,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token from create_lobby." }
			},
			"description": "Delete a lobby. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "lobby_detail", "onServerExecute": this._lobbyDetail,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token from create_lobby." }
			},
			"description": "Full lobby detail (names, players incl. difficulty, phase). Teacher-only.",
			"returns": "{code, names, players, phase}." });

		this.addMethod({ "name": "add_name", "onServerExecute": this._addName,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." },
				"name":         { "type": "string", "required": true, "description": "Name to add." }
			},
			"description": "Add a name to a lobby's approved list. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "remove_name", "onServerExecute": this._removeName,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." },
				"name":         { "type": "string", "required": true, "description": "Name to remove." }
			},
			"description": "Remove a name from a lobby's approved list. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "start_game", "onServerExecute": this._startGame,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." }
			},
			"description": "Start the game in a lobby. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "reset_game", "onServerExecute": this._resetGame,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." }
			},
			"description": "Reset a lobby back to the lobby phase. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "revive_player", "onServerExecute": this._revivePlayer,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." },
				"name":         { "type": "string", "required": true, "description": "Player name to revive." }
			},
			"description": "Restore a defeated player's HP to full. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "set_arduino_status", "onServerExecute": this._setArduinoStatus,
			"parameters": {
				"code":      { "type": "string",  "required": true, "description": "Lobby code." },
				"name":      { "type": "string",  "required": true, "description": "Player name." },
				"connected": { "type": "boolean", "required": true, "description": "Arduino connected?" }
			},
			"description": "Player reports their Arduino connection status.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "send_emoji", "onServerExecute": this._sendEmoji,
			"parameters": {
				"code":  { "type": "string", "required": true, "description": "Lobby code." },
				"name":  { "type": "string", "required": true, "description": "Player name." },
				"emoji": { "type": "string", "required": true, "description": "Emoji character to broadcast." }
			},
			"description": "Player sends an emoji reaction to the lobby.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "send_message", "onServerExecute": this._sendMessage,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." },
				"text":         { "type": "string", "required": true, "description": "Message text to broadcast." }
			},
			"description": "Teacher broadcasts a global message to the lobby. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "set_player_paused", "onServerExecute": this._setPlayerPaused,
			"parameters": {
				"code":         { "type": "string",  "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string",  "required": true, "description": "Teacher token." },
				"name":         { "type": "string",  "required": true, "description": "Player name." },
				"paused":       { "type": "boolean", "required": true, "description": "true=pause, false=resume." }
			},
			"description": "Teacher pauses or resumes a single player. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "set_block_button", "onServerExecute": this._setBlockButton,
			"parameters": {
				"code":         { "type": "string",  "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string",  "required": true, "description": "Teacher token." },
				"name":         { "type": "string",  "required": true, "description": "Player name." },
				"enabled":      { "type": "boolean", "required": true, "description": "Show the on-screen Block button." }
			},
			"description": "Teacher shows/hides the on-screen Block button for a single player. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "set_player_difficulty", "onServerExecute": this._setPlayerDifficulty,
			"parameters": {
				"code":         { "type": "string", "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string", "required": true, "description": "Teacher token." },
				"name":         { "type": "string", "required": true, "description": "Player name." },
				"difficulty":   { "type": "string", "required": true, "description": "easy | normal | hard" }
			},
			"description": "Teacher sets a player's difficulty level. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "report_early_press", "onServerExecute": this._reportEarlyPress,
			"parameters": {
				"code": { "type": "string", "required": true, "description": "Lobby code." },
				"name": { "type": "string", "required": true, "description": "Player name." }
			},
			"description": "Player pressed the button when there was no valid attack on them.",
			"returns": "{damaged:boolean}." });

		this.addMethod({ "name": "set_pranks_enabled", "onServerExecute": this._setPranksEnabled,
			"parameters": {
				"code":         { "type": "string",  "required": true, "description": "Lobby code." },
				"teacherToken": { "type": "string",  "required": true, "description": "Teacher token." },
				"enabled":      { "type": "boolean", "required": true, "description": "Allow players to play sounds on each other's stations." }
			},
			"description": "Teacher toggles the prank feature for a lobby. Teacher-only.",
			"returns": "{ok:true}." });

		this.addMethod({ "name": "pranks_enabled", "onServerExecute": this._pranksEnabled,
			"parameters": { "code": { "type": "string", "required": true, "description": "Lobby code." } },
			"description": "Read-only check: is the prank feature currently on for a lobby? No auth required.",
			"returns": "{enabled:boolean}." });

		this.addMethod({ "name": "prank", "onServerExecute": this._prank,
			"parameters": {
				"code":       { "type": "string", "required": true, "description": "Lobby code." },
				"from":       { "type": "string", "required": true, "description": "Player sending the prank." },
				"target":     { "type": "string", "required": true, "description": "Player whose Arduino should beep." },
				"freq":       { "type": "number", "required": true, "description": "Tone frequency 100-3000 Hz." },
				"durationMs": { "type": "number", "required": true, "description": "Tone duration 100-2000 ms." }
			},
			"description": "Send a sound to another player's Arduino. Only works when the teacher enabled pranks.",
			"returns": "{ok, reason?}." });
	}

	protected async _listNames (req: ServerRequest): Promise<any> {
		const { code } = req.jsonObj || {};
		return LobbyManager.instance().getLobby(code).listNames();
	}

	protected async _lobbyState (req: ServerRequest): Promise<any> {
		const { code } = req.jsonObj || {};
		return LobbyManager.instance().getLobby(code).publicState();
	}

	protected async _join (req: ServerRequest): Promise<any> {
		const { code, name } = req.jsonObj || {};
		if (!name) throw new Error("name required");
		return LobbyManager.instance().getLobby(code).join(name);
	}

	protected async _leave (req: ServerRequest): Promise<any> {
		const { code, name } = req.jsonObj || {};
		if (!name) throw new Error("name required");
		LobbyManager.instance().getLobby(code).leave(name);
		return { ok: true };
	}

	protected async _reportHit (req: ServerRequest): Promise<any> {
		const { code, name, attackId } = req.jsonObj || {};
		if (!name || !attackId) throw new Error("name and attackId required");
		return LobbyManager.instance().getLobby(code).reportHit(name, attackId);
	}

	protected async _reportMiss (req: ServerRequest): Promise<any> {
		const { code, name, attackId } = req.jsonObj || {};
		if (!name || !attackId) throw new Error("name and attackId required");
		return LobbyManager.instance().getLobby(code).reportMiss(name, attackId);
	}

	protected async _listLobbies (req: ServerRequest): Promise<any> {
		return { lobbies: LobbyManager.instance().listLobbies() };
	}

	protected async _createLobby (req: ServerRequest): Promise<any> {
		const lobby = LobbyManager.instance().createLobby();
		// Returned ONCE here. Anyone calling teacher-only endpoints later must include it.
		return { code: lobby.code, teacherToken: lobby.teacherToken };
	}

	protected async _deleteLobby (req: ServerRequest): Promise<any> {
		const { code, teacherToken } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		LobbyManager.instance().deleteLobby(code);
		return { ok: true };
	}

	protected async _lobbyDetail (req: ServerRequest): Promise<any> {
		const { code, teacherToken } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		return {
			code: lobby.code,
			names: lobby.approvedNames.slice(),
			players: Array.from(lobby.players.values()),
			phase: lobby.phase
		};
	}

	protected async _addName (req: ServerRequest): Promise<any> {
		const { code, teacherToken, name } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.addName(name);
		return { ok: true };
	}

	protected async _removeName (req: ServerRequest): Promise<any> {
		const { code, teacherToken, name } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.removeName(name);
		return { ok: true };
	}

	protected async _startGame (req: ServerRequest): Promise<any> {
		const { code, teacherToken } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.startGame();
		return { ok: true };
	}

	protected async _resetGame (req: ServerRequest): Promise<any> {
		const { code, teacherToken } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.reset();
		return { ok: true };
	}

	protected async _revivePlayer (req: ServerRequest): Promise<any> {
		const { code, teacherToken, name } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.revivePlayer(name);
		return { ok: true };
	}

	protected async _setArduinoStatus (req: ServerRequest): Promise<any> {
		const { code, name, connected } = req.jsonObj || {};
		LobbyManager.instance().getLobby(code).setArduinoStatus(name, !!connected);
		return { ok: true };
	}

	protected async _sendEmoji (req: ServerRequest): Promise<any> {
		const { code, name, emoji } = req.jsonObj || {};
		if (!name || !emoji) throw new Error("name and emoji required");
		// Limit emoji length to a small character to prevent abuse.
		const trimmed = String(emoji).slice(0, 8);
		LobbyManager.instance().getLobby(code).broadcastEmoji(String(name), trimmed);
		return { ok: true };
	}

	protected async _sendMessage (req: ServerRequest): Promise<any> {
		const { code, teacherToken, text } = req.jsonObj || {};
		if (!text) throw new Error("text required");
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		const trimmed = String(text).slice(0, 240);
		lobby.broadcastMessage(trimmed);
		return { ok: true };
	}

	protected async _setPlayerPaused (req: ServerRequest): Promise<any> {
		const { code, teacherToken, name, paused } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.setPlayerPaused(name, !!paused);
		return { ok: true };
	}

	protected async _setBlockButton (req: ServerRequest): Promise<any> {
		const { code, teacherToken, name, enabled } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.setBlockButtonEnabled(name, !!enabled);
		return { ok: true };
	}

	protected async _setPlayerDifficulty (req: ServerRequest): Promise<any> {
		const { code, teacherToken, name, difficulty } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.setPlayerDifficulty(name, difficulty);
		return { ok: true };
	}

	protected async _reportEarlyPress (req: ServerRequest): Promise<any> {
		const { code, name } = req.jsonObj || {};
		return LobbyManager.instance().getLobby(code).reportEarlyPress(name);
	}

	protected async _setPranksEnabled (req: ServerRequest): Promise<any> {
		const { code, teacherToken, enabled } = req.jsonObj || {};
		const lobby = LobbyManager.instance().getLobby(code);
		lobby.checkTeacher(teacherToken);
		lobby.setPranksEnabled(!!enabled);
		return { ok: true };
	}

	protected async _pranksEnabled (req: ServerRequest): Promise<any> {
		const { code } = req.jsonObj || {};
		return { enabled: LobbyManager.instance().getLobby(code).pranksEnabled };
	}

	protected async _prank (req: ServerRequest): Promise<any> {
		const { code, from, target, freq, durationMs } = req.jsonObj || {};
		return LobbyManager.instance().getLobby(code).prank(from, target, freq, durationMs);
	}
}
