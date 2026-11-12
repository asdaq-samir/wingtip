using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wingtip.Replay.Agent;

/// <summary>What a run is asked to do (Program reads it off the command line).</summary>
public sealed record Options(
    string Track,
    string Out,
    IReadOnlyList<ShotSpec> Shots,
    double Speed,
    double? OffsetFt,
    (double Lat, double Lon)? Tower,
    double SettleS);

/// <summary>
/// One replay, start to end: the track read and cut at its gaps, the
/// simulator's ground measured where the airplane touched it, the shots
/// laid out, then each run flown a frame at a time with the cameras cut on
/// the shot list's times, the recording paused over each gap. Every step
/// is logged.
/// </summary>
public static class Runner
{
    /// <summary>How high above a report the airplane waits while the ground
    /// under it is read, ft: clear of any terrain and anything built.</summary>
    const double ProbeAboveFt = 1500;
    /// <summary>How high the tower camera stands above its ground, ft.</summary>
    const double TowerAboveFt = 40;

    static readonly JsonSerializerOptions Indented = new() { WriteIndented = true, Converters = { new JsonStringEnumConverter() } };

    public static async Task<int> RunAsync(Options o, ISim sim, IRecorder recorder, StepLog log, CancellationToken cancel)
    {
        var track = ReadyTrack.Read(o.Track);
        var runs = track.Runs();
        log.Step("track.read", new { track.Registration, track.Type, track.Day, track.Altitude, reports = track.Points.Count, runs = runs.Count, gaps = track.Gaps, track.Source, track.License });
        if (runs.Count == 0) throw new InvalidDataException("No run of two reports or more between the gaps.");

        sim.Freeze(true);
        var anchors = Heights.Anchors(runs);
        var measured = new List<(Report, double)>();
        foreach (var a in anchors)
        {
            sim.Place(new Pose(a.T, a.Lat, a.Lon, a.AltFt!.Value + ProbeAboveFt, a.TrackDeg ?? 0, 0, 0, 0, false));
            var ground = await sim.GroundFtAsync(a.Lat, a.Lon, cancel);
            measured.Add((a, ground));
            log.Step("ground.measured", new { a.T, a.Lat, a.Lon, reportedFt = a.AltFt, groundFt = ground });
        }
        var wheels = await sim.WheelHeightFtAsync(cancel);
        var heights = new Heights(measured.Select(m => (m.Item1, m.Item2 + wheels)), o.OffsetFt);
        log.Step("heights", new { heights.OffsetFt, wheelsFt = wheels, anchors = anchors.Count, given = o.OffsetFt is not null });

        var paths = runs.Select(run => new FlightPath(run, r => heights.FtMsl(r, run))).ToList();
        var shots = ShotList.Plan(paths, o.Shots);
        var (towerLat, towerLon) = o.Tower ?? ShotList.TowerSpot(anchors.Count > 0 ? anchors[^1] : runs[0][0]);
        var tower = (towerLat, towerLon, await sim.GroundFtAsync(towerLat, towerLon, cancel) + TowerAboveFt);
        log.Step("plan", new { shots, tower = new { tower.towerLat, tower.towerLon, altFt = tower.Item3 } });

        var started = false;
        for (var i = 0; i < paths.Count; i++)
        {
            var path = paths[i];
            var mine = shots.Where(s => s.From >= path.Start && s.To <= path.End).ToList();
            sim.Place(path.At(path.Start)!);
            sim.SetZulu(DateTimeOffset.FromUnixTimeMilliseconds((long)(path.Start * 1000)).UtcDateTime);
            sim.Aim(ShotList.CameraFor(mine[0], path, tower));
            log.Step("run.settle", new { run = i, path.Start, path.End, seconds = o.SettleS });
            // The scenery and the airplane load round the first camera
            // before anything is recorded.
            await Task.Delay(TimeSpan.FromSeconds(o.SettleS), cancel);
            if (started) recorder.Unpause();
            else await recorder.StartAsync(cancel);
            started = true;

            log.Step("run.start", new { run = i, shot = mine[0] });
            var clock = Stopwatch.StartNew();
            var shot = 0;
            var frames = 0L;
            while (true)
            {
                await sim.NextFrameAsync(cancel);
                var t = path.Start + clock.Elapsed.TotalSeconds * o.Speed;
                if (t > path.End) break;
                while (shot + 1 < mine.Count && t >= mine[shot + 1].From)
                {
                    shot++;
                    sim.Aim(ShotList.CameraFor(mine[shot], path, tower));
                    log.Step("shot", mine[shot]);
                }
                sim.Place(path.At(t)!);
                frames++;
            }
            log.Step("run.end", new { run = i, frames, seconds = clock.Elapsed.TotalSeconds });
            if (i < paths.Count - 1)
            {
                recorder.Pause();
                log.Step("gap", new { from = path.End, to = paths[i + 1].Start });
            }
        }

        var file = recorder.Finish();
        sim.ReleaseCamera();
        sim.Freeze(false);
        var summary = new { track = o.Track, file, heights.OffsetFt, shots, runs = paths.Select(p => new { p.Start, p.End }) };
        await File.WriteAllTextAsync(Path.Combine(o.Out, "summary.json"), JsonSerializer.Serialize(summary, Indented), cancel);
        log.Step("done", new { file });
        return 0;
    }
}
