using System.IO.Ports;
using System.Text;

namespace ArduinoBoss.Client;

/// <summary>
/// Mirrors public/js/serial.js: line-buffered reads, line-terminated writes,
/// async event for each line received from the Arduino.
/// </summary>
public sealed class ArduinoSerial : IDisposable
{
	private readonly SerialPort _port;
	private readonly StringBuilder _readBuf = new();
	private CancellationTokenSource? _cts;
	private Task? _readLoop;

	public event Action<string>? LineReceived;
	public event Action? Closed;

	public ArduinoSerial(string portName, int baudRate = 9600)
	{
		_port = new SerialPort(portName, baudRate, Parity.None, 8, StopBits.One)
		{
			NewLine = "\n",
			ReadTimeout = 200,
			WriteTimeout = 500
		};
	}

	public bool IsOpen => _port.IsOpen;

	public void Open()
	{
		_port.Open();
		_cts = new CancellationTokenSource();
		_readLoop = Task.Run(() => ReadLoop(_cts.Token));
	}

	private async Task ReadLoop(CancellationToken ct)
	{
		var buf = new byte[256];
		try
		{
			while (!ct.IsCancellationRequested && _port.IsOpen)
			{
				int read;
				try
				{
					read = await _port.BaseStream.ReadAsync(buf.AsMemory(0, buf.Length), ct);
				}
				catch (OperationCanceledException) { break; }
				catch (IOException) { break; }
				if (read <= 0) continue;
				_readBuf.Append(Encoding.ASCII.GetString(buf, 0, read));
				while (true)
				{
					var s = _readBuf.ToString();
					int idx = s.IndexOf('\n');
					if (idx < 0) break;
					var line = s[..idx].Trim();
					_readBuf.Clear();
					_readBuf.Append(s[(idx + 1)..]);
					if (line.Length == 0) continue;
					try { LineReceived?.Invoke(line); }
					catch (Exception ex) { Console.Error.WriteLine($"line handler: {ex.Message}"); }
				}
			}
		}
		finally
		{
			try { Closed?.Invoke(); } catch { /* swallow */ }
		}
	}

	public void Write(string command)
	{
		if (!_port.IsOpen) return;
		try { _port.WriteLine(command); }
		catch (Exception) { /* port may be closing */ }
	}

	public void LedOn() => Write("LED:ON");
	public void LedOff() => Write("LED:OFF");
	public void Buzz(int freq) => Write($"BUZZ:{freq}");
	public void BuzzOff() => Write("BUZZ:OFF");
	public void Attack(int durationMs) => Write($"ATTACK:{durationMs}");

	public void Dispose()
	{
		try { _cts?.Cancel(); } catch { }
		try { _readLoop?.Wait(500); } catch { }
		try { if (_port.IsOpen) _port.Close(); } catch { }
		_port.Dispose();
		_cts?.Dispose();
	}

	/// <summary>List likely Arduino ports. On Linux these are /dev/ttyUSB* and /dev/ttyACM*.</summary>
	public static string[] ListPorts() => SerialPort.GetPortNames();
}
