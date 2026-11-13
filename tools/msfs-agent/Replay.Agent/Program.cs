using System.CommandLine;
using System.Globalization;
using Wingtip.Replay;
using Wingtip.Replay.Agent;

// wingtip-replay: a Studio track flown again in Microsoft Flight Simulator
// 2024, filmed by OBS. infra/sim-trial/run-replay.ps1 runs it on the trial's
// instance; --dry-run walks the plan anywhere, with no simulator or OBS.

var track = new Option<FileInfo>("--track") { Description = "The track, as tools/msfs-agent/prepare-track.sh writes it", Required = true };
var outDir = new Option<DirectoryInfo>("--out") { Description = "Where the recording, the log and summary.json go", Required = true };
var resolution = new Option<string>("--resolution") { Description = "1440p or 4k", DefaultValueFactory = _ => "1440p" };
var shots = new Option<string?>("--shots") { Description = $"camera:seconds, ... ({string.Join(", ", ShotList.Kinds)}); the default list where not given" };
var speed = new Option<double>("--speed") { Description = "How many times real time", DefaultValueFactory = _ => 1 };
var offset = new Option<double?>("--offset-ft") { Description = "Move every height by this, ft, in place of the one measured at the landings" };
var tower = new Option<string?>("--tower") { Description = "lat,lon of the tower camera; beside the last touchdown where not given" };
var settle = new Option<double>("--settle-s") { Description = "Seconds for the scenery to load before each run is filmed", DefaultValueFactory = _ => 12 };
var obsUrl = new Option<Uri>("--obs") { Description = "obs-websocket's address", DefaultValueFactory = _ => new Uri("ws://127.0.0.1:4455") };
var obsPassword = new Option<string?>("--obs-password-file") { Description = "A file holding obs-websocket's password" };
var waitSim = new Option<double>("--wait-sim-min") { Description = "Minutes to wait for the simulator and a flight", DefaultValueFactory = _ => 20 };
var flight = new Option<string?>("--flight") { Description = "A saved flight (.FLT) to load when the simulator is at its menu" };
var flipBank = new Option<bool>("--flip-bank") { Description = "Bank the other way (if the first run shows the turns banked outwards)" };
var dryRun = new Option<bool>("--dry-run") { Description = "No simulator, no OBS: log the plan and the cameras only" };

var root = new RootCommand("Fly a Studio track again in MSFS 2024 and record it with OBS.")
{
    track, outDir, resolution, shots, speed, offset, tower, settle, obsUrl, obsPassword, waitSim, flight, flipBank, dryRun,
};

root.SetAction(async (parsed, cancel) =>
{
    var dir = parsed.GetValue(outDir)!;
    dir.Create();
    using var log = new StepLog(Path.Combine(dir.FullName, "agent.log.jsonl"));
    var (width, height) = parsed.GetValue(resolution)?.ToLowerInvariant() switch
    {
        "4k" or "2160p" => (3840, 2160),
        "1440p" => (2560, 1440),
        var other => throw new ArgumentException($"--resolution {other}: 1440p or 4k"),
    };
    var options = new Options(
        parsed.GetValue(track)!.FullName,
        dir.FullName,
        parsed.GetValue(shots) is { } list ? ShotList.Parse(list) : ShotList.Default,
        parsed.GetValue(speed),
        parsed.GetValue(offset),
        parsed.GetValue(tower) is { } spot ? LatLon(spot) : null,
        parsed.GetValue(settle));
    log.Step("start", new { options, width, height, dryRun = parsed.GetValue(dryRun) });
    try
    {
        var dry = parsed.GetValue(dryRun);
        await using ISim sim = dry ? new DryRunSim(log) : RealSim(log, parsed.GetValue(flipBank));
        using IRecorder recorder = dry
            ? new NoRecorder(log)
            : new ObsRecorder(log, parsed.GetValue(obsUrl)!, ReadPassword(parsed.GetValue(obsPassword)), (3840, 2160), (width, height), dir.FullName);
        await sim.ReadyAsync(TimeSpan.FromMinutes(parsed.GetValue(waitSim)), parsed.GetValue(flight), cancel);
        return await Runner.RunAsync(options, sim, recorder, log, cancel);
    }
    catch (Exception err) when (err is not OperationCanceledException)
    {
        log.Step("failed", new { error = err.GetType().Name, err.Message, err.StackTrace });
        return 1;
    }
});

return await root.Parse(args).InvokeAsync();

static (double, double) LatLon(string text)
{
    var parts = text.Split(',');
    if (parts.Length == 2 && double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)
        && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var lon))
        return (lat, lon);
    throw new FormatException($"--tower {text}: write lat,lon");
}

static string ReadPassword(string? file) => file is null ? "" : File.ReadAllText(file).Trim();

#if SIMCONNECT
static ISim RealSim(StepLog log, bool flipBank) => new SimConnectSim(log, flipBank);
#else
static ISim RealSim(StepLog log, bool flipBank) =>
    throw new PlatformNotSupportedException("Built without the MSFS 2024 SDK's SimConnect: only --dry-run works here.");
#endif
