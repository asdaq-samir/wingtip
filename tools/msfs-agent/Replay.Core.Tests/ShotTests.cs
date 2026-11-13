using Xunit;

namespace Wingtip.Replay.Tests;

public sealed class ShotTests
{
    static readonly ReadyTrack Sedona = ReadyTrack.Read(Path.Combine(AppContext.BaseDirectory, "fixtures", "n901tq-2026-11-11-sedona.json"));

    static IReadOnlyList<FlightPath> Paths() => FlightPath.Of(Sedona, new Heights([]).FtMsl);

    [Fact]
    public void The_cameras_are_the_kinds_the_shared_schema_names()
    {
        Assert.Equal(ShotList.Kinds, Enum.GetNames<ShotKind>().Select(n => n.ToLowerInvariant()));
        Assert.Throws<FormatException>(() => ShotList.Parse("drone:10"));
    }

    [Fact]
    public void Each_run_is_covered_end_to_end_and_no_shot_crosses_a_gap()
    {
        var paths = Paths();
        var shots = ShotList.Plan(paths, ShotList.Default);
        foreach (var path in paths)
        {
            var mine = shots.Where(s => s.From >= path.Start && s.To <= path.End).ToList();
            Assert.Equal(path.Start, mine[0].From);
            Assert.Equal(path.End, mine[^1].To);
            for (var i = 1; i < mine.Count; i++) Assert.Equal(mine[i - 1].To, mine[i].From);
        }
        Assert.All(shots, s => Assert.Contains(paths, p => s.From >= p.Start && s.To <= p.End));
    }

    [Fact]
    public void The_tower_watches_each_take_off_and_landing_from_the_ground()
    {
        var paths = Paths();
        var shots = ShotList.Plan(paths, ShotList.Default);
        // The first run ends in the flare (the roll is in the gap), so no
        // tower there; the second starts and ends on the ground.
        Assert.NotEqual(ShotKind.Tower, shots.Last(s => s.To <= paths[0].End).Kind);
        Assert.Equal(ShotKind.Tower, shots.First(s => s.From >= paths[1].Start).Kind);
        Assert.Equal(ShotKind.Tower, shots[^1].Kind);
    }

    [Fact]
    public void A_flyby_stands_beside_the_path_ahead_of_the_airplane()
    {
        var path = Paths()[0];
        var shot = new Shot(ShotKind.Flyby, path.Start + 60, path.Start + 74);
        var camera = ShotList.CameraFor(shot, path, (0, 0, 0));
        var at = path.At(shot.From + 6)!;
        Assert.Equal(CameraFrame.World, camera.Frame);
        Assert.InRange(Geo.DistanceM(at.Lat, at.Lon, camera.X, camera.Y), 39.9, 40.1);
        Assert.Equal(at.AltFt + 15, camera.Z, 6);
    }

    [Fact]
    public void A_shot_list_is_read_and_a_wrong_one_refused()
    {
        Assert.Equal([new ShotSpec(ShotKind.Chase, 30), new ShotSpec(ShotKind.Cockpit, 12.5)], ShotList.Parse("chase:30, Cockpit:12.5"));
        Assert.Throws<FormatException>(() => ShotList.Parse("drone:10"));
        Assert.Throws<FormatException>(() => ShotList.Parse("chase:0"));
    }

    [Fact]
    public void The_tower_spot_is_across_the_runway_from_the_touchdown()
    {
        var touchdown = new Report(0, 34.85, -111.79, 4500, 60, 30, 0, 0, false, false);
        var (lat, lon) = ShotList.TowerSpot(touchdown);
        Assert.Equal(250, Geo.DistanceM(34.85, -111.79, lat, lon), 3);
        var (e, n) = Geo.ToLocal(34.85, -111.79, lat, lon);
        Assert.Equal(300, Geo.Bearing(e, n), 6);
    }
}
