import { randomUUID } from "crypto";
import { EventEmitter } from "events";

const DEFAULT_NAMES: string[] = [
	"Aria", "Bram", "Cleo", "Dax", "Echo", "Finn", "Gwen", "Hawk", "Indy", "Juno",
	"Kai", "Luna", "Milo", "Nova", "Otto", "Pip", "Quill", "Ren", "Sage", "Tess",
	"Uma", "Vex", "Wren", "Xan", "Yara", "Zane", "Astrid", "Blaze", "Clover", "Dash",
	"Ember", "Fox", "Glen", "Holly", "Iris", "Jett", "Knox", "Leo", "Mira", "Nico",
	"Onyx", "Piper", "Quinn", "Rex", "Storm", "Talon", "Ursa", "Vesper", "Wolf", "Xena",
	"Yuki", "Zara", "Arrow", "Bear", "Cinder", "Drake", "Falcon", "Frost", "Ghost", "Hunter",
	"Ivy", "Jasper", "Kit", "Lark", "Maverick", "Nyx", "Orion", "Phoenix", "Quest", "Raven",
	"Scout", "Thorn", "Umber", "Vale", "Willow", "Xerxes", "Yew", "Zephyr", "Ash", "Briar",
	"Cliff", "Dune", "Edge", "Forge", "Grove", "Hex", "Inko", "Jade", "Kestrel", "Lyric",
	"Moss", "Nimbus", "Oak", "Pyre", "Quartz", "Reef", "Sable", "Tundra", "Umbra", "Vortex",
	"Sonic", "Jake", "Patrick", "Goku", "SpongeBob", "Mario", "Luigi", "Peach"
];

const DEFAULT_PLAYER_HP = 5;
const STARTING_COUNTDOWN_MS = 3000;
const RESETTING_COUNTDOWN_MS = 5000;

export type Phase = "lobby" | "starting" | "playing" | "victory" | "defeat" | "resetting";

export type Difficulty = "easy" | "normal" | "hard";

export interface Player {
	name: string;
	score: number;
	hp: number;
	maxHp: number;
	waiting: boolean;
	connected: boolean;
	disconnectedAt: number | null;
	arduinoConnected: boolean;
	paused: boolean;
	immuneUntil: number | null;
	difficulty: Difficulty;
	blockButtonEnabled: boolean;
}

export interface Attack {
	id: string;
	target: string;
	startedAt: number;
	durationMs: number;
	resolved: boolean;
}

export interface Transition {
	type: "starting" | "resetting";
	endsAt: number;
}

export interface NextAttack {
	target: string;
	scheduledAt: number;
}

export interface PublicLobbyState {
	code: string;
	phase: Phase;
	bossHp: number;
	maxBossHp: number;
	players: Player[];
	currentAttack: Attack | null;
	nextAttack: NextAttack | null;
	transition: Transition | null;
	pranksEnabled: boolean;
	lastEventId: number;
	serverTime: number;
}

export interface LobbySummary {
	code: string;
	phase: Phase;
	playerCount: number;
	approvedNameCount: number;
}

export class Lobby {
	code: string;
	approvedNames: string[];
	players: Map<string, Player> = new Map();
	phase: Phase = "lobby";
	maxBossHp = 30;
	bossHp = 30;
	playerMaxHp = DEFAULT_PLAYER_HP;
	currentAttack: Attack | null = null;
	nextAttack: NextAttack | null = null;
	processedAttackIds: Set<string> = new Set();
	lastEventId = 0;
	transition: Transition | null = null;
	pranksEnabled: boolean = false;
	private attackTimer: NodeJS.Timeout | null = null;
	private transitionTimer: NodeJS.Timeout | null = null;
	createdAt: number = Date.now();
	teacherToken: string;
	private manager: LobbyManager;
	private connectionCounts: Map<string, number> = new Map();
	private removalTimers: Map<string, NodeJS.Timeout> = new Map();
	// Round-robin queue so every eligible player is attacked once before any
	// player is attacked a second time. Shuffled per round to keep it fun.
	private targetQueue: string[] = [];
	static readonly OFFLINE_REMOVE_MS = 2000;

	constructor (code: string, manager: LobbyManager) {
		this.code = code;
		this.manager = manager;
		this.approvedNames = [...DEFAULT_NAMES];
		this.teacherToken = randomUUID();
	}

	checkTeacher (token: string): void {
		if (!token || token !== this.teacherToken) {
			throw new Error("Not authorized: invalid teacher token for this lobby");
		}
	}

	private emitChange (): void {
		this.manager.emit("lobby:state", this.code, this.publicState());
		this.manager.emit("lobbies:list");
	}

	listNames (): { name: string; taken: boolean }[] {
		return this.approvedNames.map(n => ({ name: n, taken: this.players.has(n) }));
	}

	addName (name: string): void {
		const clean = name.trim();
		if (!clean) throw new Error("Name cannot be empty");
		if (this.approvedNames.includes(clean)) return;
		this.approvedNames.push(clean);
		this.emitChange();
	}

	removeName (name: string): void {
		this.approvedNames = this.approvedNames.filter(n => n !== name);
		this.players.delete(name);
		this.emitChange();
	}

	join (name: string): Player {
		if (this.phase === "resetting") throw new Error("Lobby is resetting; please wait.");
		if (!this.approvedNames.includes(name)) throw new Error("Name not in approved list");
		if (this.players.has(name)) throw new Error("Name already taken");
		const isWaiting = this.phase !== "lobby";
		const p: Player = {
			name,
			score: 0,
			hp: isWaiting ? 0 : this.playerMaxHp,
			maxHp: this.playerMaxHp,
			waiting: isWaiting,
			connected: false,
			disconnectedAt: null,
			arduinoConnected: false,
			paused: false,
			immuneUntil: null,
			difficulty: "hard",
			blockButtonEnabled: false
		};
		this.players.set(name, p);
		this.lastEventId++;
		this.emitChange();
		return p;
	}

	onPlayerConnect (name: string): void {
		const cur = this.connectionCounts.get(name) || 0;
		this.connectionCounts.set(name, cur + 1);
		// Cancel any pending removal — they reconnected in time.
		const timer = this.removalTimers.get(name);
		if (timer) {
			clearTimeout(timer);
			this.removalTimers.delete(name);
		}
		const p = this.players.get(name);
		if (p) {
			let changed = false;
			if (!p.connected) { p.connected = true; changed = true; }
			if (p.disconnectedAt !== null) { p.disconnectedAt = null; changed = true; }
			if (changed) this.emitChange();
		}
	}

	onPlayerDisconnect (name: string): void {
		const cur = this.connectionCounts.get(name) || 0;
		const next = Math.max(0, cur - 1);
		this.connectionCounts.set(name, next);
		if (next === 0) {
			const p = this.players.get(name);
			if (p && p.connected) {
				p.connected = false;
				p.disconnectedAt = Date.now();
				p.arduinoConnected = false;
				this.emitChange();
				// Schedule removal after the offline window.
				const existing = this.removalTimers.get(name);
				if (existing) clearTimeout(existing);
				const timer = setTimeout(() => {
					this.removalTimers.delete(name);
					this.leave(name);
				}, Lobby.OFFLINE_REMOVE_MS);
				this.removalTimers.set(name, timer);
			}
		}
	}

	setArduinoStatus (name: string, connected: boolean): void {
		const p = this.players.get(name);
		if (!p) throw new Error("Player not in lobby");
		if (p.arduinoConnected === connected) return;
		p.arduinoConnected = connected;
		this.emitChange();
	}

	setBlockButtonEnabled (name: string, enabled: boolean): void {
		const p = this.players.get(name);
		if (!p) throw new Error("Player not in lobby");
		if (p.blockButtonEnabled === enabled) return;
		p.blockButtonEnabled = enabled;
		this.lastEventId++;
		this.emitChange();
	}

	setPlayerDifficulty (name: string, difficulty: Difficulty): void {
		const p = this.players.get(name);
		if (!p) throw new Error("Player not in lobby");
		if (difficulty !== "easy" && difficulty !== "normal" && difficulty !== "hard") {
			throw new Error("Invalid difficulty");
		}
		if (p.difficulty === difficulty) return;
		p.difficulty = difficulty;
		this.lastEventId++;
		this.emitChange();
	}

	reportEarlyPress (name: string): { damaged: boolean } {
		if (this.phase !== "playing") return { damaged: false };
		const p = this.players.get(name);
		if (!p) return { damaged: false };
		if (p.waiting || p.paused || p.hp <= 0) return { damaged: false };
		// If a valid attack is in flight on this player, this isn't really an early press —
		// caller should have used reportHit. Don't penalize.
		if (this.currentAttack && this.currentAttack.target === name && !this.currentAttack.resolved) {
			return { damaged: false };
		}
		// Grace-period immunity blocks penalties too.
		if (p.immuneUntil != null && p.immuneUntil > Date.now()) return { damaged: false };
		if (p.difficulty !== "hard") return { damaged: false };
		p.hp = Math.max(0, p.hp - 1);
		this.lastEventId++;
		this.checkGameEnd();
		this.emitChange();
		return { damaged: true };
	}

	broadcastEmoji (name: string, emoji: string): void {
		// Ephemeral — not part of public state. Just relayed to lobby clients.
		this.manager.emit("lobby:emoji", this.code, { name, emoji });
	}

	broadcastMessage (text: string): void {
		this.manager.emit("lobby:message", this.code, { text });
	}

	setPranksEnabled (enabled: boolean): void {
		if (this.pranksEnabled === enabled) return;
		this.pranksEnabled = enabled;
		this.lastEventId++;
		this.emitChange();
	}

	prank (fromName: string, targetName: string, freq: number, durationMs: number): { ok: boolean; reason?: string } {
		if (!this.pranksEnabled) return { ok: false, reason: "pranks disabled" };
		// Case-insensitive target lookup so kids don't have to match capitalization.
		const wanted = String(targetName || "").trim().toLowerCase();
		let resolved: string | null = null;
		for (const existing of this.players.keys()) {
			if (existing.toLowerCase() === wanted) { resolved = existing; break; }
		}
		if (!resolved) return { ok: false, reason: "target not in lobby" };
		// Clamp to safe limits so a runaway client can't fry a buzzer or freeze it on.
		const f = Math.max(100, Math.min(3000, Math.floor(Number(freq) || 0)));
		const d = Math.max(100, Math.min(2000, Math.floor(Number(durationMs) || 0)));
		this.manager.emit("lobby:prank", this.code, {
			from: String(fromName || "?"),
			target: resolved,
			freq: f,
			durationMs: d
		});
		return { ok: true };
	}

	leave (name: string): void {
		if (this.players.delete(name)) {
			this.connectionCounts.delete(name);
			const timer = this.removalTimers.get(name);
			if (timer) clearTimeout(timer);
			this.removalTimers.delete(name);
			this.lastEventId++;
			this.emitChange();
		}
	}

	startGame (): void {
		if (this.players.size === 0) throw new Error("No players have joined");
		if (this.phase !== "lobby") throw new Error("Cannot start: phase is " + this.phase);
		this.phase = "starting";
		this.transition = { type: "starting", endsAt: Date.now() + STARTING_COUNTDOWN_MS };
		if (this.transitionTimer) clearTimeout(this.transitionTimer);
		this.transitionTimer = setTimeout(() => this.actuallyStart(), STARTING_COUNTDOWN_MS);
		this.lastEventId++;
		this.emitChange();
	}

	private actuallyStart (): void {
		if (this.phase !== "starting") return;
		this.phase = "playing";
		this.transition = null;
		this.transitionTimer = null;
		this.bossHp = this.maxBossHp;
		this.targetQueue = []; // fresh round-robin for the new game
		// Only non-waiting players participate in this round.
		// Anyone who joined as waiting (whether before or during the countdown)
		// stays waiting through the entire game.
		for (const p of this.players.values()) {
			if (!p.waiting) {
				p.score = 0;
				p.hp = p.maxHp;
			}
		}
		this.currentAttack = null;
		this.processedAttackIds.clear();
		this.lastEventId++;
		this.emitChange();
		this.scheduleNextAttack(2000);
	}

	reset (): void {
		// "reset" now means: announce a 5-second countdown, then clear.
		if (this.phase === "resetting") return;
		// Stop attacks immediately so no more HP changes during the countdown.
		if (this.attackTimer) clearTimeout(this.attackTimer);
		this.attackTimer = null;
		this.currentAttack = null;
		this.nextAttack = null;
		this.phase = "resetting";
		this.transition = { type: "resetting", endsAt: Date.now() + RESETTING_COUNTDOWN_MS };
		if (this.transitionTimer) clearTimeout(this.transitionTimer);
		this.transitionTimer = setTimeout(() => this.actuallyReset(), RESETTING_COUNTDOWN_MS);
		this.lastEventId++;
		this.emitChange();
	}

	private actuallyReset (): void {
		this.phase = "lobby";
		// Keep players in the lobby; promote any waiting players, restore HP/score.
		for (const p of this.players.values()) {
			p.waiting = false;
			p.hp = p.maxHp;
			p.score = 0;
		}
		this.bossHp = this.maxBossHp;
		this.currentAttack = null;
		this.processedAttackIds.clear();
		this.transition = null;
		this.transitionTimer = null;
		this.targetQueue = [];
		if (this.attackTimer) clearTimeout(this.attackTimer);
		this.attackTimer = null;
		this.lastEventId++;
		this.emitChange();
	}

	dispose (): void {
		if (this.attackTimer) clearTimeout(this.attackTimer);
		this.attackTimer = null;
		if (this.transitionTimer) clearTimeout(this.transitionTimer);
		this.transitionTimer = null;
		for (const t of this.removalTimers.values()) clearTimeout(t);
		this.removalTimers.clear();
	}

	private scheduleNextAttack (delayMs: number): void {
		if (this.attackTimer) clearTimeout(this.attackTimer);
		const target = this.pickNextTarget();
		if (target) {
			this.nextAttack = { target, scheduledAt: Date.now() + delayMs };
		} else {
			this.nextAttack = null;
		}
		this.attackTimer = setTimeout(() => this.launchAttack(), delayMs);
	}

	private pickNextTarget (): string | null {
		const eligible = this.targetablePlayers();
		if (eligible.length === 0) return null;
		const eligibleNames = new Set(eligible.map(p => p.name));

		// Drop anyone from the queue who is no longer eligible (paused, dead,
		// left the lobby, immune, etc.).
		this.targetQueue = this.targetQueue.filter(n => eligibleNames.has(n));

		// Refill: every eligible player gets one slot per round, shuffled.
		if (this.targetQueue.length === 0) {
			const refill = eligible.map(p => p.name);
			for (let i = refill.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const tmp = refill[i]; refill[i] = refill[j]; refill[j] = tmp;
			}
			this.targetQueue = refill;
		}

		return this.targetQueue.shift() || null;
	}

	private alivePlayers (): Player[] {
		// Only counts active (non-waiting) players for targeting and end-of-game checks.
		return Array.from(this.players.values()).filter(p => !p.waiting && p.hp > 0);
	}

	private activePlayers (): Player[] {
		return Array.from(this.players.values()).filter(p => !p.waiting);
	}

	static readonly RESUME_GRACE_MS = 2500;

	private targetablePlayers (): Player[] {
		// Eligible attack targets: active, alive, not paused, not currently immune.
		const now = Date.now();
		return Array.from(this.players.values()).filter(p =>
			!p.waiting
			&& p.hp > 0
			&& !p.paused
			&& (p.immuneUntil == null || p.immuneUntil <= now)
		);
	}

	setPlayerPaused (name: string, paused: boolean): void {
		const p = this.players.get(name);
		if (!p) throw new Error("Player not in lobby");
		if (p.paused === paused) return;
		const wasPaused = p.paused;
		p.paused = paused;

		// If just unpaused, give a brief grace period before the boss can attack again.
		if (wasPaused && !paused) {
			p.immuneUntil = Date.now() + Lobby.RESUME_GRACE_MS;
		}

		// If we just paused the current attack target, end it without damage and
		// schedule a new attack for someone else.
		if (paused && this.phase === "playing" && this.currentAttack
				&& this.currentAttack.target === name && !this.currentAttack.resolved) {
			this.currentAttack.resolved = true;
			this.processedAttackIds.add(this.currentAttack.id);
			this.currentAttack = null;
			if (this.attackTimer) clearTimeout(this.attackTimer);
			this.attackTimer = null;
			this.scheduleNextAttack(800);
		}

		// If we just unpaused and the boss has no current attack, we may want to
		// re-tick the attack scheduler so the grace period takes effect cleanly.
		// (No-op if a timer is already running — it'll just respect the immunity.)

		this.lastEventId++;
		this.emitChange();
	}

	revivePlayer (name: string): void {
		const p = this.players.get(name);
		if (!p) throw new Error("Player not in lobby");
		if (p.waiting) throw new Error("Player is waiting for next round");
		if (p.hp > 0) return;
		p.hp = p.maxHp;
		// Brief grace period after revive so they aren't instantly hit again.
		p.immuneUntil = Date.now() + Lobby.RESUME_GRACE_MS;
		// If everyone was dead and the game ended in defeat, return to playing.
		if (this.phase === "defeat") {
			this.phase = "playing";
			this.scheduleNextAttack(1500);
		}
		this.lastEventId++;
		this.emitChange();
	}

	private launchAttack (): void {
		if (this.phase !== "playing") return;

		// Prefer the pre-picked target if they're still eligible.
		let target: string | null = null;
		if (this.nextAttack) {
			const pre = this.players.get(this.nextAttack.target);
			const now = Date.now();
			if (pre && !pre.waiting && pre.hp > 0 && !pre.paused
					&& (pre.immuneUntil == null || pre.immuneUntil <= now)) {
				target = pre.name;
			}
		}
		this.nextAttack = null;

		if (!target) {
			target = this.pickNextTarget();
			if (!target) {
				this.checkGameEnd();
				this.emitChange();
				if (this.phase === "playing") {
					const now = Date.now();
					const soonest = Array.from(this.players.values())
						.filter(p => !p.waiting && p.hp > 0 && !p.paused && p.immuneUntil != null)
						.map(p => (p.immuneUntil as number) - now)
						.filter(d => d > 0)
						.sort((a, b) => a - b)[0];
					const wait = soonest != null ? Math.min(Math.max(soonest + 50, 400), 3000) : 800;
					this.scheduleNextAttack(wait);
				}
				return;
			}
		}
		const fightProgress = 1 - this.bossHp / this.maxBossHp;
		const durationMs = Math.max(900, Math.round(2000 - fightProgress * 1100));
		const attack: Attack = {
			id: randomUUID(),
			target,
			startedAt: Date.now(),
			durationMs,
			resolved: false
		};
		this.currentAttack = attack;
		this.lastEventId++;
		this.emitChange();
		setTimeout(() => this.expireAttack(attack.id), durationMs + 100);
	}

	private damageTarget (name: string): void {
		const p = this.players.get(name);
		if (p) p.hp = Math.max(0, p.hp - 1);
	}

	private expireAttack (attackId: string): void {
		if (this.phase !== "playing") return;
		if (!this.currentAttack || this.currentAttack.id !== attackId) return;
		if (this.currentAttack.resolved) return;
		this.currentAttack.resolved = true;
		this.processedAttackIds.add(attackId);
		this.damageTarget(this.currentAttack.target);
		this.lastEventId++;
		this.checkGameEnd();
		this.emitChange();
		if (this.phase === "playing") {
			const gap = Math.max(800, Math.round(2200 - (1 - this.bossHp / this.maxBossHp) * 1200));
			this.scheduleNextAttack(gap);
		}
	}

	reportHit (name: string, attackId: string): { ok: boolean; reason?: string } {
		if (this.phase !== "playing") return { ok: false, reason: "not playing" };
		if (!this.currentAttack) return { ok: false, reason: "no active attack" };
		if (this.currentAttack.id !== attackId) return { ok: false, reason: "attack mismatch" };
		if (this.currentAttack.resolved) return { ok: false, reason: "already resolved" };
		if (this.currentAttack.target !== name) return { ok: false, reason: "not your attack" };
		this.currentAttack.resolved = true;
		this.processedAttackIds.add(attackId);
		const player = this.players.get(name);
		if (player) player.score += 1;
		this.bossHp = Math.max(0, this.bossHp - 1);
		this.lastEventId++;
		this.checkGameEnd();
		this.emitChange();
		if (this.phase === "playing") {
			const gap = Math.max(700, Math.round(2000 - (1 - this.bossHp / this.maxBossHp) * 1200));
			this.scheduleNextAttack(gap);
		}
		return { ok: true };
	}

	reportMiss (name: string, attackId: string): { ok: boolean } {
		if (this.phase !== "playing") return { ok: false };
		if (!this.currentAttack) return { ok: false };
		if (this.currentAttack.id !== attackId) return { ok: false };
		if (this.currentAttack.resolved) return { ok: false };
		this.currentAttack.resolved = true;
		this.processedAttackIds.add(attackId);
		this.damageTarget(this.currentAttack.target);
		this.lastEventId++;
		this.checkGameEnd();
		this.emitChange();
		if (this.phase === "playing") {
			const gap = Math.max(800, Math.round(2200 - (1 - this.bossHp / this.maxBossHp) * 1200));
			this.scheduleNextAttack(gap);
		}
		return { ok: true };
	}

	private checkGameEnd (): void {
		if (this.bossHp <= 0) {
			this.phase = "victory";
			if (this.attackTimer) clearTimeout(this.attackTimer);
			this.attackTimer = null;
			this.currentAttack = null;
			this.nextAttack = null;
		} else if (this.activePlayers().length > 0 && this.alivePlayers().length === 0) {
			this.phase = "defeat";
			if (this.attackTimer) clearTimeout(this.attackTimer);
			this.attackTimer = null;
			this.currentAttack = null;
			this.nextAttack = null;
		}
	}

	publicState (): PublicLobbyState {
		return {
			code: this.code,
			phase: this.phase,
			bossHp: this.bossHp,
			maxBossHp: this.maxBossHp,
			players: Array.from(this.players.values()).map(p => {
				// Strip per-player difficulty from the public state so players
				// never see what level the teacher assigned anyone.
				const { difficulty, ...visible } = p;
				return visible as Player;
			}),
			currentAttack: this.currentAttack && !this.currentAttack.resolved
				? { ...this.currentAttack }
				: null,
			nextAttack: this.nextAttack ? { ...this.nextAttack } : null,
			transition: this.transition ? { ...this.transition } : null,
			pranksEnabled: this.pranksEnabled,
			lastEventId: this.lastEventId,
			serverTime: Date.now()
		};
	}

	summary (): LobbySummary {
		return {
			code: this.code,
			phase: this.phase,
			playerCount: this.players.size,
			approvedNameCount: this.approvedNames.length
		};
	}
}

export class LobbyManager extends EventEmitter {
	private static _instance: LobbyManager;
	static instance (): LobbyManager {
		if (!LobbyManager._instance) LobbyManager._instance = new LobbyManager();
		return LobbyManager._instance;
	}

	private lobbies: Map<string, Lobby> = new Map();

	constructor () {
		super();
		this.setMaxListeners(50);
	}

	createLobby (): Lobby {
		let code: string;
		let attempts = 0;
		do {
			code = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
			attempts++;
			if (attempts > 1000) throw new Error("Could not generate a unique lobby code");
		} while (this.lobbies.has(code));
		const lobby = new Lobby(code, this);
		this.lobbies.set(code, lobby);
		this.emit("lobbies:list");
		return lobby;
	}

	deleteLobby (code: string): void {
		const lobby = this.lobbies.get(code);
		if (lobby) {
			lobby.dispose();
			this.lobbies.delete(code);
			this.emit("lobby:gone", code);
			this.emit("lobbies:list");
		}
	}

	getLobby (code: string): Lobby {
		const c = (code || "").trim();
		const lobby = this.lobbies.get(c);
		if (!lobby) throw new Error("Lobby not found");
		return lobby;
	}

	listLobbies (): LobbySummary[] {
		return Array.from(this.lobbies.values())
			.sort((a, b) => a.createdAt - b.createdAt)
			.map(l => l.summary());
	}
}
