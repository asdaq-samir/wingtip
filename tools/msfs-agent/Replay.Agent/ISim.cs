namespace Wingtip.Replay.Agent;

/// <summary>What the replay asks of the simulator. SimConnectSim is the
/// real one (MSFS 2024's SimConnect); DryRunSim stands in for it where
/// there is none, so the plan can be walked through anywhere.</summary>
public interface ISim : IAsyncDisposable
{
    /// <summary>Connected, and the pilot's airplane in a flight (not a menu).</summary>
    Task ReadyAsync(TimeSpan wait, string? flightFile, CancellationToken cancel);

    /// <summary>Holds the airplane where it is put: position, height and attitude.</summary>
    void Freeze(bool hold);

    /// <summary>Sets the simulator's clock, so the light is the flight's.</summary>
    void SetZulu(DateTime utc);

    /// <summary>The simulator's ground under a point, ft above its sea.</summary>
    Task<double> GroundFtAsync(double lat, double lon, CancellationToken cancel);

    /// <summary>How far the airplane's reference point sits above its wheels
    /// on the ground, ft (the simulator's STATIC CG TO GROUND).</summary>
    Task<double> WheelHeightFtAsync(CancellationToken cancel);

    void Place(Pose pose);

    void Aim(Camera camera);

    void ReleaseCamera();

    /// <summary>Until the simulator draws its next frame.</summary>
    Task NextFrameAsync(CancellationToken cancel);
}

/// <summary>No simulator: every call written to the log, the frames a
/// sixtieth of a second apart.</summary>
public sealed class DryRunSim(StepLog log) : ISim
{
    public Task ReadyAsync(TimeSpan wait, string? flightFile, CancellationToken cancel)
    {
        log.Step("sim.dry-run", new { flightFile });
        return Task.CompletedTask;
    }

    public void Freeze(bool hold) => log.Step("sim.freeze", new { hold });

    public void SetZulu(DateTime utc) => log.Step("sim.zulu", new { utc });

    public Task<double> GroundFtAsync(double lat, double lon, CancellationToken cancel) => Task.FromResult(0.0);

    public Task<double> WheelHeightFtAsync(CancellationToken cancel) => Task.FromResult(0.0);

    public void Place(Pose pose) { }

    public void Aim(Camera camera) => log.Step("sim.camera", camera);

    public void ReleaseCamera() => log.Step("sim.camera-release");

    public Task NextFrameAsync(CancellationToken cancel) => Task.Delay(TimeSpan.FromSeconds(1 / 60.0), cancel);

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
