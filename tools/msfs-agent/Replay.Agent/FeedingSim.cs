using System.Net.Sockets;
using System.Text;

namespace Wingtip.Replay.Agent;

/// <summary>
/// A simulator whose every placed pose also goes to the test flight's feed
/// (--feed HOST:PORT, docs/SIM-FLIGHT.md) as a state line once a second
/// (Replay.Core's StateLine), so a replay in MSFS 2024 drives the apps as
/// X-Plane's test flight does. Everything else is the simulator's own.
/// </summary>
public sealed class FeedingSim(ISim sim, string host, int port, StepLog log) : ISim
{
    readonly UdpClient _udp = new();
    readonly StateLine _lines = new(DateTime.UtcNow);
    Pose? _last;
    int _failed;

    public Task ReadyAsync(TimeSpan wait, string? flightFile, CancellationToken cancel) => sim.ReadyAsync(wait, flightFile, cancel);

    public void Freeze(bool hold) => sim.Freeze(hold);

    public void SetZulu(DateTime utc) => sim.SetZulu(utc);

    public Task<double> GroundFtAsync(double lat, double lon, CancellationToken cancel) => sim.GroundFtAsync(lat, lon, cancel);

    public Task<double> WheelHeightFtAsync(CancellationToken cancel) => sim.WheelHeightFtAsync(cancel);

    public void Place(Pose pose)
    {
        sim.Place(pose);
        _last = pose;
        if (_lines.For(pose) is { } line)
            Send(line);
    }

    public void Aim(Camera camera) => sim.Aim(camera);

    public void ReleaseCamera() => sim.ReleaseCamera();

    public Task NextFrameAsync(CancellationToken cancel) => sim.NextFrameAsync(cancel);

    void Send(string line)
    {
        try
        {
            var data = Encoding.UTF8.GetBytes(line);
            _udp.Send(data, data.Length, host, port);
        }
        catch (SocketException err)
        {
            // The feed may start late: the replay goes on.
            if (_failed++ == 0)
                log.Step("feed.unreachable", new { host, port, err.Message });
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_last is { } pose)
            Send(_lines.Done(pose));
        log.Step("feed.done", new { host, port, failed = _failed });
        _udp.Dispose();
        await sim.DisposeAsync();
    }
}
