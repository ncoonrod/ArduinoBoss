using System.Text.Json.Serialization;

namespace ArduinoBoss.Client;

// Mirrors src/GameState.ts. Only the fields the player client cares about are
// strongly typed; everything else is left untyped so server additions don't
// break the client.

public sealed class Player
{
	[JsonPropertyName("name")] public string Name { get; set; } = "";
	[JsonPropertyName("score")] public int Score { get; set; }
	[JsonPropertyName("hp")] public int Hp { get; set; }
	[JsonPropertyName("maxHp")] public int MaxHp { get; set; }
	[JsonPropertyName("waiting")] public bool Waiting { get; set; }
	[JsonPropertyName("connected")] public bool Connected { get; set; }
	[JsonPropertyName("arduinoConnected")] public bool ArduinoConnected { get; set; }
	[JsonPropertyName("paused")] public bool Paused { get; set; }
	[JsonPropertyName("blockButtonEnabled")] public bool BlockButtonEnabled { get; set; }
}

public sealed class Attack
{
	[JsonPropertyName("id")] public string Id { get; set; } = "";
	[JsonPropertyName("target")] public string Target { get; set; } = "";
	[JsonPropertyName("startedAt")] public long StartedAt { get; set; }
	[JsonPropertyName("durationMs")] public long DurationMs { get; set; }
	[JsonPropertyName("resolved")] public bool Resolved { get; set; }
}

public sealed class Transition
{
	[JsonPropertyName("type")] public string Type { get; set; } = "";
	[JsonPropertyName("endsAt")] public long EndsAt { get; set; }
}

public sealed class PublicLobbyState
{
	[JsonPropertyName("code")] public string Code { get; set; } = "";
	[JsonPropertyName("phase")] public string Phase { get; set; } = "lobby";
	[JsonPropertyName("bossHp")] public int BossHp { get; set; }
	[JsonPropertyName("maxBossHp")] public int MaxBossHp { get; set; }
	[JsonPropertyName("players")] public List<Player> Players { get; set; } = new();
	[JsonPropertyName("currentAttack")] public Attack? CurrentAttack { get; set; }
	[JsonPropertyName("transition")] public Transition? Transition { get; set; }
	[JsonPropertyName("pranksEnabled")] public bool PranksEnabled { get; set; }
	[JsonPropertyName("lastEventId")] public long LastEventId { get; set; }
	[JsonPropertyName("serverTime")] public long ServerTime { get; set; }
}

public sealed class PrankEvent
{
	[JsonPropertyName("from")] public string From { get; set; } = "";
	[JsonPropertyName("target")] public string Target { get; set; } = "";
	[JsonPropertyName("freq")] public int Freq { get; set; }
	[JsonPropertyName("durationMs")] public int DurationMs { get; set; }
}

public sealed class TeacherMessage
{
	[JsonPropertyName("text")] public string Text { get; set; } = "";
}
