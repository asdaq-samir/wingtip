using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wingtip.Replay.Agent;

/// <summary>
/// Every step the agent takes, one JSON line each (UTC time, step, what
/// it was given or found), to the console and a file beside the recording,
/// which the run's PowerShell uploads to S3 whatever the outcome; SSM keeps
/// the console's copy in the bucket too.
/// </summary>
public sealed class StepLog(string path) : IDisposable
{
    static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, Converters = { new JsonStringEnumConverter() } };
    readonly StreamWriter _file = new(path, append: true) { AutoFlush = true };
    readonly Lock _lock = new();

    public void Step(string step, object? detail = null)
    {
        var line = JsonSerializer.Serialize(new { at = DateTime.UtcNow, step, detail }, Json);
        lock (_lock)
        {
            _file.WriteLine(line);
            Console.WriteLine(line);
        }
    }

    public void Dispose() => _file.Dispose();
}
