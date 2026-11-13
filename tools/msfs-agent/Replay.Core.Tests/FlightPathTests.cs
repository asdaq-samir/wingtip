using Xunit;

namespace Wingtip.Replay.Tests;

/// <summary>The agent only eases between the engine's frames (sim_flight
/// draws the path and estimates the attitude, with its sources).</summary>
public sealed class FlightPathTests
{
    static Frame At(double t, double lat, double lon, double alt, double track = 90, double pitch = 0, double bank = 0, bool ground = false) =>
        new(t, lat, lon, alt, 90, track, pitch, bank, ground);

    static Report Report(double t) => new(t, 0, 0, null, null, null, null, 0, false, false);

    static FlightPath Path(params Frame[] frames) => new([Report(frames[0].T), Report(frames[^1].T)], frames, f => f.AltFt);

    [Fact]
    public void It_passes_through_every_frame_with_the_engines_attitude()
    {
        Frame[] frames = [At(0, 34.80, -111.80, 5000, 10, 2, 15), At(0.1, 34.8001, -111.7999, 5002, 11, 2.5, 16), At(0.2, 34.8002, -111.7998, 5004, 12, 3, 17)];
        var path = Path(frames);
        foreach (var f in frames)
        {
            var at = path.At(f.T)!;
            Assert.Equal(f.Lat, at.Lat, 9);
            Assert.Equal(f.Lon, at.Lon, 9);
            Assert.Equal(f.AltFt, at.AltFt, 6);
            Assert.Equal(f.TrackDeg, at.HeadingDeg, 6);
            Assert.Equal(f.PitchDeg, at.PitchDeg, 6);
            Assert.Equal(f.BankDeg, at.BankDeg, 6);
        }
    }

    [Fact]
    public void Between_two_frames_each_figure_is_eased_in_proportion()
    {
        var mid = Path(At(0, 34.80, -111.80, 5000, 10, 2, 10), At(0.1, 34.81, -111.79, 5010, 20, 4, 20)).At(0.025)!;
        Assert.Equal(34.8025, mid.Lat, 9);
        Assert.Equal(5002.5, mid.AltFt, 6);
        Assert.Equal(12.5, mid.HeadingDeg, 6);
        Assert.Equal(2.5, mid.PitchDeg, 6);
        Assert.Equal(12.5, mid.BankDeg, 6);
    }

    [Fact]
    public void The_heading_turns_the_short_way_through_north()
    {
        var mid = Path(At(0, 34.8, -111.8, 5000, 350), At(1, 34.8, -111.8, 5000, 10)).At(0.75)!;
        Assert.Equal(5, mid.HeadingDeg, 6);
    }

    [Fact]
    public void Nothing_is_answered_outside_the_run()
    {
        var path = Path(At(10, 34.8, -111.8, 5000), At(12, 34.801, -111.8, 5000));
        Assert.Null(path.At(9.99));
        Assert.Null(path.At(12.01));
    }
}
