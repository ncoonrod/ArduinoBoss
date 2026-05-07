import { HotAPI, HotServer, HotClient } from "hotstaq";
import { GameRoute } from "./GameRoute";
import { LobbyManager } from "./GameState";

/**
 * The App's API and routes.
 */
export class AppAPI extends HotAPI
{
	constructor (baseUrl: string, connection: HotServer | HotClient = null as any, db: any = null)
	{
		super(baseUrl, connection, db);

		this.onPreRegister = async (): Promise<boolean> =>
			{
				return (true);
			};
		this.onPostRegister = async (): Promise<boolean> =>
			{
				// websocketServer is created during HotHTTPServer.listen() which happens
				// AFTER onPostRegister returns. Defer wiring until the next tick so
				// the server property is populated.
				setImmediate(() => this.wireWebSockets());
				return (true);
			};

		this.addRoute (new GameRoute (this));
	}

	private wireWebSockets (): void {
		const httpServer: any = this.connection;
		const wsServer = httpServer && httpServer.websocketServer;
		if (!wsServer) {
			console.warn("WebSocket server not available; lobby push disabled.");
			return;
		}

		// Tag clients on connect based on the auth payload they sent.
		// Players connect with { tag: "lobby:12345", name: "Aria" } and
		// teachers with { tag: "teacher" }.
		const previousOnConn = wsServer.onSuccessfulConnection;
		wsServer.onSuccessfulConnection = async (client: any): Promise<void> => {
			try {
				const auth = client.socket && client.socket.handshake && client.socket.handshake.auth;
				const tag = auth && typeof auth.tag === "string" ? auth.tag : "";
				const name = auth && typeof auth.name === "string" ? auth.name : "";
				if (tag) wsServer.tagClient(client, tag);

				if (tag.indexOf("lobby:") === 0 && name) {
					const code = tag.substring("lobby:".length);
					client.persistentData = { code, name };
					try {
						LobbyManager.instance().getLobby(code).onPlayerConnect(name);
					} catch (e) {}
				}

				if (previousOnConn) await previousOnConn(client);
			} catch (e) {
				console.error("WS connect handler error:", e);
			}
		};

		const previousOnDisc = wsServer.onDisconnect;
		wsServer.onDisconnect = (client: any): void => {
			try {
				const data = client && client.persistentData;
				if (data && data.code && data.name) {
					try {
						LobbyManager.instance().getLobby(data.code).onPlayerDisconnect(data.name);
					} catch (e) {}
				}
				if (previousOnDisc) previousOnDisc(client);
			} catch (e) {
				console.error("WS disconnect handler error:", e);
			}
		};

		// Allow auth without a callback (default HotStaq rejects auth without one).
		wsServer.onServerAuthorize = async (req: any): Promise<any> => {
			return req && req.jsonObj ? req.jsonObj : {};
		};

		const safeSend = (tag: string, event: string, data: any): void => {
			try {
				if (wsServer.tags && wsServer.tags[tag]) {
					wsServer.sendToTaggedClients(tag, event, data);
				}
			} catch (e) {
				// no listeners or transient error — ignore
			}
		};

		const mgr = LobbyManager.instance();

		mgr.on("lobby:state", (code: string, state: any) => {
			safeSend("lobby:" + code, "lobby_state", state);
		});

		mgr.on("lobbies:list", () => {
			safeSend("teacher", "lobbies_list", { lobbies: mgr.listLobbies() });
		});

		mgr.on("lobby:gone", (code: string) => {
			safeSend("lobby:" + code, "lobby_gone", { code });
		});

		mgr.on("lobby:emoji", (code: string, payload: any) => {
			safeSend("lobby:" + code, "emoji", payload);
		});

		mgr.on("lobby:message", (code: string, payload: any) => {
			safeSend("lobby:" + code, "teacher_message", payload);
		});

		mgr.on("lobby:prank", (code: string, payload: any) => {
			safeSend("lobby:" + code, "prank", payload);
		});

		console.log("WebSocket lobby push wired up.");
	}
}
