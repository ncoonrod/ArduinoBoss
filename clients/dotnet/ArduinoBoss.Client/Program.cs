using ArduinoBoss.Client;

// ----- args -----
string baseUrl = "https://boss.highersoftware.com";
string? code = null;
string? name = null;
string? portName = null;
int baudRate = 9600;

for (int i = 0; i < args.Length; i++)
{
	switch (args[i])
	{
		case "--base-url": baseUrl = args[++i]; break;
		case "--code":     code     = args[++i]; break;
		case "--name":     name     = args[++i]; break;
		case "--port":     portName = args[++i]; break;
		case "--baud":     baudRate = int.Parse(args[++i]); break;
		case "--list-ports":
			foreach (var p in ArduinoSerial.ListPorts()) Console.WriteLine(p);
			return 0;
		case "-h": case "--help":
			PrintHelp();
			return 0;
	}
}

if (code is null || name is null)
{
	PrintHelp();
	return 1;
}

portName ??= ArduinoSerial.ListPorts().FirstOrDefault();
if (portName is null)
{
	Console.Error.WriteLine("No serial port detected. Pass --port /dev/ttyACM0 (Linux) or COM3 (Windows).");
	return 2;
}

Console.WriteLine($"server : {baseUrl}");
Console.WriteLine($"lobby  : {code}");
Console.WriteLine($"name   : {name}");
Console.WriteLine($"serial : {portName} @ {baudRate}");
Console.WriteLine();

// ----- wire up -----
using var serial = new ArduinoSerial(portName, baudRate);
using var api = new GameApi(baseUrl);
await using var ws = new GameWebSocket(baseUrl, $"lobby:{code}", name);

string? activeAttackId = null;
string? activeAttackTarget = null;
string? lastResolvedAttackId = null;
DateTimeOffset activeAttackExpires = DateTimeOffset.MinValue;
int lastBossHp = -1;

void EndDefense()
{
	if (activeAttackId is null) return;
	activeAttackId = null;
	activeAttackTarget = null;
	if (serial.IsOpen) { serial.LedOff(); serial.BuzzOff(); }
}

async Task OnButtonPress()
{
	if (activeAttackId is not null && activeAttackTarget == name && lastResolvedAttackId != activeAttackId)
	{
		var id = activeAttackId;
		lastResolvedAttackId = id;
		EndDefense();
		try
		{
			var res = await api.ReportHit(code!, name!, id!);
			if (res.TryGetProperty("ok", out var ok) && ok.GetBoolean())
				Console.WriteLine($"[hit] BLOCKED attack {id}");
		}
		catch (Exception ex) { Console.Error.WriteLine($"reportHit: {ex.Message}"); }
		return;
	}
	try
	{
		var res = await api.ReportEarlyPress(code!, name!);
		if (res.TryGetProperty("damaged", out var d) && d.GetBoolean())
			Console.WriteLine("[hit] TOO EARLY (-1 hp)");
	}
	catch (Exception ex) { Console.Error.WriteLine($"reportEarlyPress: {ex.Message}"); }
}

serial.LineReceived += line =>
{
	Console.WriteLine($"<- {line}");
	if (line == "BTN:PRESS") _ = OnButtonPress();
};
serial.Closed += () =>
{
	Console.WriteLine("[serial] closed");
	try { _ = api.SetArduinoStatus(code!, name!, false); } catch { }
};

ws.LobbyState += async state =>
{
	// Boss took damage — log it.
	if (lastBossHp >= 0 && state.BossHp < lastBossHp)
		Console.WriteLine($"[boss] took {lastBossHp - state.BossHp} damage ({state.BossHp}/{state.MaxBossHp})");
	lastBossHp = state.BossHp;

	if (state.Phase != "playing")
	{
		EndDefense();
		Console.WriteLine($"[phase] {state.Phase}");
		return;
	}
	var a = state.CurrentAttack;
	if (a != null && a.Id != activeAttackId && lastResolvedAttackId != a.Id)
	{
		if (a.Target == name)
		{
			activeAttackId = a.Id;
			activeAttackTarget = a.Target;
			activeAttackExpires = DateTimeOffset.FromUnixTimeMilliseconds(a.StartedAt + a.DurationMs);
			Console.WriteLine($"[attack] INCOMING — block within {a.DurationMs} ms");
			if (serial.IsOpen) { serial.LedOn(); serial.Buzz(900); }

			// Miss timer: if we don't block in time, report the miss.
			var attackId = a.Id;
			var dueIn = (int)Math.Max(200, (a.StartedAt + a.DurationMs - state.ServerTime) + 200);
			_ = Task.Delay(dueIn).ContinueWith(async _ =>
			{
				if (activeAttackId == attackId && lastResolvedAttackId != attackId)
				{
					lastResolvedAttackId = attackId;
					EndDefense();
					Console.WriteLine($"[miss] {attackId}");
					try { await api.ReportMiss(code!, name!, attackId); } catch { }
				}
			});
		}
		else
		{
			Console.WriteLine($"[attack] boss is hitting {a.Target}");
		}
	}
	if (a == null && activeAttackId is not null) EndDefense();
	await Task.CompletedTask;
};

ws.LobbyGone += () =>
{
	Console.WriteLine("[lobby] deleted");
	Environment.Exit(0);
};

ws.Prank += data =>
{
	if (data.Target != name) return;
	Console.WriteLine($"[prank] from {data.From} ({data.Freq} Hz, {data.DurationMs} ms)");
	if (!serial.IsOpen) return;
	serial.Buzz(data.Freq);
	_ = Task.Delay(data.DurationMs).ContinueWith(_ => { if (serial.IsOpen) serial.BuzzOff(); });
};

ws.TeacherMessage += msg => Console.WriteLine($"[teacher] {msg.Text}");

// ----- start -----
serial.Open();
Console.WriteLine($"[serial] opened {portName}");

try
{
	await api.Join(code!, name!);
	Console.WriteLine("[api] joined");
}
catch (Exception ex)
{
	Console.Error.WriteLine($"join failed: {ex.Message}");
	return 3;
}

try { await api.SetArduinoStatus(code!, name!, true); } catch { }

await ws.ConnectAsync();
Console.WriteLine("[ws] connected");

Console.WriteLine();
Console.WriteLine("Press the button on your Arduino to block. Ctrl-C to leave.");
Console.WriteLine();

var quit = new TaskCompletionSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; quit.TrySetResult(); };
await quit.Task;

Console.WriteLine("[exit] leaving lobby...");
try { await api.SetArduinoStatus(code!, name!, false); } catch { }
try { await api.Leave(code!, name!); } catch { }
return 0;

static void PrintHelp()
{
	Console.WriteLine("Usage: arduinoboss --code 12345 --name Aria [--port /dev/ttyACM0] [--base-url URL] [--baud 9600]");
	Console.WriteLine("       arduinoboss --list-ports");
}
