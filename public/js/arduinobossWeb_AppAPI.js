if (typeof (arduinobossWeb) === "undefined")
	var arduinobossWeb = {};

var HotAPIGlobal = undefined;

if (typeof (HotAPI) !== "undefined")
	HotAPIGlobal = HotAPI;

if (typeof (window) !== "undefined")
{
	if (typeof (window.HotAPI) !== "undefined")
		HotAPIGlobal = window.HotAPI;
}

/**
 * Process a JSON object, and get it ready to make a request.
 */
function HotStaqProcessJSONObject (jsonObj)
{
	return (jsonObj);
}

/**
 * Make a request to the server.
 */
function HotStaqPostJSONObject (methodType, url, jsonObj, auth)
{
	let headers = {
			"Accept": "application/json",
			"Content-Type": "application/json"
		};

	if (auth != null)
		headers["Authorization"] = "Bearer " + auth;

	let promise = fetch (url, {
			"method": methodType,
			"headers": headers,
			body: JSON.stringify (jsonObj)
		});

	return (promise);
}

/**
 * The game API route.
 */
class game
{
	constructor (baseUrl, connection, db)
	{
		

		if (baseUrl == null)
			baseUrl = "http://127.0.0.1:5000";

		if (connection === undefined)
			connection = null;

		if (db === undefined)
			db = null;

		/**
		 * The base url to make calls to.
		 */
		this.baseUrl = baseUrl;
		/**
		 * The connection to the server/client.
		 */
		this.connection = connection;
		/**
		 * The bearer token used to connect to the server.
		 */
		this.bearerToken = null;
		/**
		 * The database connection, if any.
		 */
		this.db = db;
	}

	/**
	 * Make a call to the API. THIS CANNOT upload files yet.
	 */
	makeCall (route, data, httpMethod = "post", files = {}, bearer = "")
	{
		var promise = new Promise ((resolve, reject) => 
			{
				let url = this.baseUrl;

				if (url[(url.length - 1)] === "/")
					url = url.substr (0, (url.length - 1));

				if (route[0] !== "/")
					url += "/";

				url += route;

				if (bearer === "")
				{
					if (Hot.BearerToken != null)
						bearer = Hot.BearerToken;
				}

				HotStaqPostJSONObject (httpMethod, url, data, bearer).then (
					function (response)
					{
						var result = response.json ();
						resolve (result);
					});
			});
		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_LIST_NAMES_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 */

	/**
	 * The list_names method.
	 * 
	 * @param {GAME_LIST_NAMES_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} Array of {name, taken}.
	 */
	list_names (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/list_names`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_LOBBY_STATE_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 */

	/**
	 * The lobby_state method.
	 * 
	 * @param {GAME_LOBBY_STATE_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} PublicLobbyState.
	 */
	lobby_state (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/lobby_state`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_JOIN_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 * @property {string} name Name to claim.
	 */

	/**
	 * The join method.
	 * 
	 * @param {GAME_JOIN_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} Player.
	 */
	join (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/join`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_LEAVE_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 * @property {string} name Name to release.
	 */

	/**
	 * The leave method.
	 * 
	 * @param {GAME_LEAVE_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok:true}.
	 */
	leave (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/leave`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_REPORT_HIT_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 * @property {string} name Player name.
	 * @property {string} attackId Attack id being defended.
	 */

	/**
	 * The report_hit method.
	 * 
	 * @param {GAME_REPORT_HIT_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok, reason?}.
	 */
	report_hit (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/report_hit`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_REPORT_MISS_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 * @property {string} name Player name.
	 * @property {string} attackId Attack id missed.
	 */

	/**
	 * The report_miss method.
	 * 
	 * @param {GAME_REPORT_MISS_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok}.
	 */
	report_miss (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/report_miss`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_LIST_LOBBIES_JSON_OBJECT_TYPE
	 */

	/**
	 * The list_lobbies method.
	 * 
	 * @param {GAME_LIST_LOBBIES_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {lobbies: [{code, phase, playerCount, approvedNameCount}]}.
	 */
	list_lobbies (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/list_lobbies`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_CREATE_LOBBY_JSON_OBJECT_TYPE
	 */

	/**
	 * The create_lobby method.
	 * 
	 * @param {GAME_CREATE_LOBBY_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {code}.
	 */
	create_lobby (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/create_lobby`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_DELETE_LOBBY_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 */

	/**
	 * The delete_lobby method.
	 * 
	 * @param {GAME_DELETE_LOBBY_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok:true}.
	 */
	delete_lobby (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/delete_lobby`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_LOBBY_DETAIL_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 */

	/**
	 * The lobby_detail method.
	 * 
	 * @param {GAME_LOBBY_DETAIL_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {code, names, players, phase}.
	 */
	lobby_detail (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/lobby_detail`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_ADD_NAME_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 * @property {string} name Name to add.
	 */

	/**
	 * The add_name method.
	 * 
	 * @param {GAME_ADD_NAME_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok:true}.
	 */
	add_name (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/add_name`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_REMOVE_NAME_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 * @property {string} name Name to remove.
	 */

	/**
	 * The remove_name method.
	 * 
	 * @param {GAME_REMOVE_NAME_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok:true}.
	 */
	remove_name (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/remove_name`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_START_GAME_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 */

	/**
	 * The start_game method.
	 * 
	 * @param {GAME_START_GAME_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok:true}.
	 */
	start_game (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/start_game`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}

	/**
	 * The JSON object to send to the server.
	 * 
	 * @typedef {Object} GAME_RESET_GAME_JSON_OBJECT_TYPE
	 * @property {string} code Lobby code.
	 */

	/**
	 * The reset_game method.
	 * 
	 * @param {GAME_RESET_GAME_JSON_OBJECT_TYPE} jsonObj
	 * 
	 * @returns {string} {ok:true}.
	 */
	reset_game (jsonObj)
	{
		var promise = new Promise ((resolve, reject) => 
			{
				const url = `${this.baseUrl}/v1/game/reset_game`;
				const auth = null;

				if (this.authorization != null)
				{
					if (this.authorization.toAuthorizationHeaderString != null)
						auth = this.authorization.toAuthorizationHeaderString ();
				}

				
				jsonObj = HotStaqProcessJSONObject (jsonObj);
				HotStaqPostJSONObject ("POST", url, jsonObj, auth).then (
					function (response)
					{
						var result = response.json ();

						resolve (result);
					});
			});

		return (promise);
	}
}

if (typeof (arduinobossWeb.AppAPI) === "undefined")
{
	if (typeof (HotAPIGlobal) !== "undefined")
	{
		arduinobossWeb.AppAPI = class extends HotAPIGlobal
			{
				constructor (baseUrl, connection, db)
				{
					super (baseUrl, connection, db);

					this.game = new game (baseUrl, connection, db);
				}
			}
	}
}