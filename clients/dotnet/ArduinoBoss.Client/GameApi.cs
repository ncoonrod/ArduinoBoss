using System.Net.Http.Json;
using System.Text.Json;

namespace ArduinoBoss.Client;

/// <summary>
/// Mirrors public/js/api.js — POST JSON to /v1/game/&lt;method&gt;, parse JSON response.
/// </summary>
public sealed class GameApi : IDisposable
{
	private readonly HttpClient _http;

	public GameApi(string baseUrl)
	{
		_http = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/") };
	}

	private async Task<JsonElement> Call(string path, object? body = null, CancellationToken ct = default)
	{
		var res = await _http.PostAsJsonAsync(path.TrimStart('/'), body ?? new { }, ct);
		var text = await res.Content.ReadAsStringAsync(ct);
		if (!res.IsSuccessStatusCode)
		{
			try
			{
				using var doc = JsonDocument.Parse(text);
				if (doc.RootElement.TryGetProperty("error", out var err))
					throw new InvalidOperationException(err.GetString());
			}
			catch (JsonException) { /* fall through */ }
			throw new InvalidOperationException($"HTTP {(int)res.StatusCode}: {text}");
		}
		return JsonDocument.Parse(text).RootElement.Clone();
	}

	private async Task<T?> CallAs<T>(string path, object? body = null, CancellationToken ct = default)
	{
		var elem = await Call(path, body, ct);
		return elem.Deserialize<T>(new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
	}

	public Task<PublicLobbyState?> LobbyState(string code, CancellationToken ct = default) =>
		CallAs<PublicLobbyState>("v1/game/lobby_state", new { code }, ct);

	public Task<JsonElement> Join(string code, string name, CancellationToken ct = default) =>
		Call("v1/game/join", new { code, name }, ct);

	public Task<JsonElement> Leave(string code, string name, CancellationToken ct = default) =>
		Call("v1/game/leave", new { code, name }, ct);

	public Task<JsonElement> ReportHit(string code, string name, string attackId, CancellationToken ct = default) =>
		Call("v1/game/report_hit", new { code, name, attackId }, ct);

	public Task<JsonElement> ReportMiss(string code, string name, string attackId, CancellationToken ct = default) =>
		Call("v1/game/report_miss", new { code, name, attackId }, ct);

	public Task<JsonElement> SetArduinoStatus(string code, string name, bool connected, CancellationToken ct = default) =>
		Call("v1/game/set_arduino_status", new { code, name, connected }, ct);

	public Task<JsonElement> ReportEarlyPress(string code, string name, CancellationToken ct = default) =>
		Call("v1/game/report_early_press", new { code, name }, ct);

	public Task<JsonElement> SendEmoji(string code, string name, string emoji, CancellationToken ct = default) =>
		Call("v1/game/send_emoji", new { code, name, emoji }, ct);

	public Task<JsonElement> Prank(string code, string from, string target, int freq, int durationMs, CancellationToken ct = default) =>
		Call("v1/game/prank", new { code, from, target, freq, durationMs }, ct);

	public Task<JsonElement> ListNames(string code, CancellationToken ct = default) =>
		Call("v1/game/list_names", new { code }, ct);

	public void Dispose() => _http.Dispose();
}
