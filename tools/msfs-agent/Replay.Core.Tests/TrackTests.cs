using Xunit;

namespace Wingtip.Replay.Tests;

/// <summary>The trial's track: N901TQ, a PA-28, two circuits at Sedona
/// (KSEZ) on 2026-11-11 from 23:40 UTC, adsb.lol's (ODbL 1.0) through the
/// Studio's export and the engine's replay_track, with one gap of 119 s
/// over the first landing's roll, and sim_flight's frames at 2 a second
/// (prepare-track.sh with RATE_HZ=2, to keep the file small).</summary>
public sealed class TrackTests
{
    static readonly ReadyTrack Sedona = ReadyTrack.Read(Path.Combine(AppContext.BaseDirectory, "fixtures", "n901tq-2026-11-11-sedona.json"));

    static IReadOnlyList<FlightPath> Paths(ReadyTrack track, Heights heights) => FlightPath.Of(track, heights.FtMsl);

    [Fact]
    public void The_fixture_is_read_with_its_source_and_licence()
    {
        Assert.Equal("N901TQ", Sedona.Registration);
        Assert.Equal("pressure", Sedona.Altitude);
        Assert.Equal("ODbL 1.0", Sedona.License);
        Assert.Single(Sedona.Gaps);
    }

    [Fact]
    public void The_runs_split_at_the_gap_and_none_spans_it()
    {
        var runs = Sedona.Runs();
        Assert.Equal(2, runs.Count);
        var gap = Sedona.Gaps[0];
        Assert.Equal(gap.From, runs[0][^1].T);
        Assert.Equal(gap.To, runs[1][0].T);
        Assert.True(runs[1][0].Gap);
        Assert.Equal(Sedona.Points.Count, runs.Sum(r => r.Length));
    }

    [Fact]
    public void No_moment_inside_the_gap_has_an_airplane()
    {
        var heights = new Heights([]);
        var paths = Paths(Sedona, heights);
        var gap = Sedona.Gaps[0];
        for (var t = gap.From + 0.5; t < gap.To; t += 0.5)
            Assert.All(paths, p => Assert.Null(p.At(t)));
    }

    [Fact]
    public void A_listed_gap_splits_the_run_even_where_no_report_is_marked()
    {
        var points = Sedona.Points.Select(p => p with { Gap = false }).ToList();
        var runs = (Sedona with { Points = points }).Runs();
        Assert.Equal(2, runs.Count);
    }

    [Fact]
    public void Each_run_has_the_engines_frames_and_none_crosses_the_gap()
    {
        var paths = Paths(Sedona, new Heights([]));
        Assert.Equal(Sedona.Runs().Count, paths.Count);
        var gap = Sedona.Gaps[0];
        Assert.True(paths[0].End <= gap.From && paths[1].Start >= gap.To);
    }

    [Fact]
    public void A_track_without_the_engines_frames_is_refused()
    {
        var json = """{"hex":"a","day":"2026-11-11","altitude":"pressure","source":"s","license":"l","gaps":[],"points":[{"t":1,"lat":0,"lon":0,"along_nm":0,"gap":false,"ground":false},{"t":2,"lat":0,"lon":0,"along_nm":0,"gap":false,"ground":false}]}""";
        Assert.Throws<InvalidDataException>(() => ReadyTrack.Parse(json));
    }

    [Fact]
    public void A_report_out_of_order_is_refused()
    {
        var json = """{"hex":"a","day":"2026-11-11","altitude":"pressure","source":"s","license":"l","gaps":[],"points":[{"t":2,"lat":0,"lon":0,"along_nm":0,"gap":false,"ground":false},{"t":1,"lat":0,"lon":0,"along_nm":0,"gap":false,"ground":false}]}""";
        Assert.Throws<InvalidDataException>(() => ReadyTrack.Parse(json));
    }

    [Fact]
    public void The_heights_are_moved_to_meet_the_simulators_ground_at_the_landings()
    {
        var anchors = Heights.Anchors(Sedona.Runs());
        Assert.NotEmpty(anchors);
        // The simulator's ground at KSEZ, as it might be measured: 4,830 ft
        // (the FAA's field elevation) at every anchor.
        var heights = new Heights(anchors.Select(a => (a, 4830.0)));
        Assert.InRange(heights.OffsetFt, 250, 400);
        var paths = Paths(Sedona, heights);
        // The run ends on the runway; sim_flight's last frame is its last
        // whole step before that report, still in the flare, so it is just
        // above the field rather than on it.
        Assert.True(paths[^1].Reports[^1].Ground);
        Assert.InRange(paths[^1].At(paths[^1].End)!.AltFt, 4830 - 60, 4830 + 60);
        // On the ground between two ground reports, the field's height.
        var rolling = paths.SelectMany(p => Enumerable.Range(0, (int)(p.End - p.Start)).Select(i => p.At(p.Start + i)!)).First(a => a.Ground);
        Assert.Equal(4830, rolling.AltFt, 3);
        // Every airborne moment is above the field, less the 25 ft of a
        // transponder's step (DO-260B) and the 10 s average around it.
        foreach (var path in paths)
        {
            for (var t = path.Start; t <= path.End; t += 1)
                Assert.True(path.At(t)!.AltFt > 4830 - 60, $"under the field at {t}");
        }
    }

    [Fact]
    public void A_given_offset_is_used_as_it_is()
    {
        Assert.Equal(-12, new Heights([], offsetFt: -12).OffsetFt);
        Assert.Equal(0, new Heights([]).OffsetFt);
    }
}
