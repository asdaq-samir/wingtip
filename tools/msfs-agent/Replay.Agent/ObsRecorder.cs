using Newtonsoft.Json.Linq;
using OBSWebsocketDotNet;
using OBSWebsocketDotNet.Types;

namespace Wingtip.Replay.Agent;

/// <summary>What the replay asks of the recorder.</summary>
public interface IRecorder : IDisposable
{
    Task StartAsync(CancellationToken cancel);
    void Pause();
    void Unpause();
    /// <summary>Stops, and gives the file written.</summary>
    string Finish();
}

/// <summary>No recorder: for a dry run.</summary>
public sealed class NoRecorder(StepLog log) : IRecorder
{
    public Task StartAsync(CancellationToken cancel)
    {
        log.Step("obs.dry-run");
        return Task.CompletedTask;
    }

    public void Pause() => log.Step("obs.pause");
    public void Unpause() => log.Step("obs.resume");
    public string Finish() => "";
    public void Dispose() { }
}

/// <summary>
/// OBS Studio through obs-websocket (protocol 5, built into OBS since 28),
/// with obs-websocket's own .NET client. The encoder (NVENC HEVC, CQP),
/// the format and the capture are set once by hand in the DCV session
/// (infra/sim-trial/README.md, step 5); here the canvas is set to the
/// desktop the simulator fills (DCV's 3840x2160 console display) and the
/// output to the run's resolution, at 60 frames a second, so a 1440p
/// recording is the 4K picture scaled down, the recordings go to the run's
/// folder, and the recording starts, pauses at a gap, resumes and stops.
/// </summary>
public sealed class ObsRecorder(StepLog log, Uri url, string password, (int Width, int Height) canvas, (int Width, int Height) output, string folder) : IRecorder
{
    /// <summary>The scene the agent records: one Game Capture of whatever
    /// runs full screen, made here where the scene collection has none.</summary>
    const string Scene = "Wingtip replay";
    readonly OBSWebsocket _obs = new();

    public async Task StartAsync(CancellationToken cancel)
    {
        var connected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _obs.Connected += (_, _) => connected.TrySetResult();
        _obs.Disconnected += (_, info) => connected.TrySetException(new IOException($"OBS refused the connection: {info.DisconnectReason}"));
        _obs.ConnectAsync(url.ToString(), password);
        await connected.Task.WaitAsync(TimeSpan.FromSeconds(30), cancel);
        log.Step("obs.connected", new { url });

        _obs.SetVideoSettings(new ObsVideoSettings
        {
            BaseWidth = canvas.Width,
            BaseHeight = canvas.Height,
            OutputWidth = output.Width,
            OutputHeight = output.Height,
            FpsNumerator = 60,
            FpsDenominator = 1,
        });
        _obs.SetRecordDirectory(folder);
        if (!_obs.GetSceneList().Scenes.Any(s => s.Name == Scene))
        {
            _obs.CreateScene(Scene);
            _obs.CreateInput(Scene, "Simulator", "game_capture", new JObject { ["capture_mode"] = "any_fullscreen", ["capture_cursor"] = false }, true);
        }
        _obs.SetCurrentProgramScene(Scene);
        log.Step("obs.ready", new { canvas, output, fps = 60, folder, scene = Scene });
        _obs.StartRecord();
        log.Step("obs.recording");
    }

    public void Pause()
    {
        _obs.PauseRecord();
        log.Step("obs.paused");
    }

    public void Unpause()
    {
        _obs.ResumeRecord();
        log.Step("obs.resumed");
    }

    public string Finish()
    {
        var file = _obs.StopRecord();
        log.Step("obs.stopped", new { file });
        return file;
    }

    public void Dispose()
    {
        if (_obs.IsConnected) _obs.Disconnect();
    }
}
