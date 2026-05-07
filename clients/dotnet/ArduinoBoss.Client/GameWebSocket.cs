using System.Text.Json;
using SocketIOClient;

namespace ArduinoBoss.Client;

/// <summary>
/// Mirrors public/js/ws.js — connects with auth { tag, name }, unwraps the
/// HotStaq { uuid, data } envelope before invoking handlers.
/// </summary>
public sealed class GameWebSocket : IAsyncDisposable
{
	private readonly SocketIO _socket;

	public event Action<PublicLobbyState>? LobbyState;
	public event Action? LobbyGone;
	public event Action<PrankEvent>? Prank;
	public event Action<TeacherMessage>? TeacherMessage;
	public event Action<JsonElement>? Emoji;

	public GameWebSocket(string baseUrl, string tag, string? name)
	{
		var auth = new Dictionary<string, object>(StringComparer.Ordinal) { { "tag", tag } };
		if (!string.IsNullOrEmpty(name)) auth["name"] = name;

		_socket = new SocketIO(baseUrl, new SocketIOOptions
		{
			Path = "/socket.io",
			Auth = auth,
			Reconnection = true,
			ReconnectionDelay = 500,
			ReconnectionDelayMax = 4000,
			Transport = SocketIOClient.Transport.TransportProtocol.WebSocket
		});

		_socket.On("lobby_state", r => LobbyState?.Invoke(Unwrap<PublicLobbyState>(r)!));
		_socket.On("lobby_gone", _ => LobbyGone?.Invoke());
		_socket.On("prank", r => Prank?.Invoke(Unwrap<PrankEvent>(r)!));
		_socket.On("teacher_message", r => TeacherMessage?.Invoke(Unwrap<TeacherMessage>(r)!));
		_socket.On("emoji", r => Emoji?.Invoke(UnwrapElement(r)));
	}

	public Task ConnectAsync() => _socket.ConnectAsync();

	private static T? Unwrap<T>(SocketIOResponse resp)
	{
		var elem = UnwrapElement(resp);
		return elem.Deserialize<T>(new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
	}

	private static JsonElement UnwrapElement(SocketIOResponse resp)
	{
		// HotStaq sends { uuid, data } as the first arg. Unwrap to data.
		var first = resp.GetValue<JsonElement>(0);
		if (first.ValueKind == JsonValueKind.Object
			&& first.TryGetProperty("uuid", out _)
			&& first.TryGetProperty("data", out var data))
		{
			return data.Clone();
		}
		return first.Clone();
	}

	public async ValueTask DisposeAsync()
	{
		try { await _socket.DisconnectAsync(); } catch { }
		_socket.Dispose();
	}
}
