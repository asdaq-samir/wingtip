using Xunit;

namespace Wingtip.Replay.Tests;

public sealed class FlightPathTests
{
    static Report Air(double t, double lat, double lon, double alt, double? track = null) =>
        new(t, lat, lon, alt, 90, track, 0, 0, false, false);

    static double Height(Report r) => r.AltFt ?? 0;

    [Fact]
    public void It_passes_through_every_report()
    {
        Report[] run = [Air(0, 34.80, -111.80, 5000), Air(2, 34.801, -111.799, 5020), Air(3, 34.8016, -111.7985, 5030), Air(5, 34.803, -111.797, 5010)];
        var path = new FlightPath(run, Height);
        foreach (var r in run)
        {
            var at = path.At(r.T)!;
            Assert.Equal(r.Lat, at.Lat, 9);
            Assert.Equal(r.Lon, at.Lon, 9);
            Assert.Equal(r.AltFt!.Value, at.AltFt, 6);
        }
    }

    [Fact]
    public void A_straight_steady_climb_is_eased_evenly_with_wings_level()
    {
        // Due north, 100 m a second (194 kt), climbing 5 m a second.
        Report[] run = [.. Enumerable.Range(0, 6).Select(i => Air(i, Geo.FromLocal(34.8, -111.8, 0, 100 * i).Lat, -111.8, (1500 + 5 * i) * Geo.FtPerM))];
        var path = new FlightPath(run, Height);
        var mid = path.At(2.5)!;
        Assert.Equal(250, Geo.ToLocal(34.8, -111.8, mid.Lat, mid.Lon).N, 3);
        Assert.Equal((1500 + 12.5) * Geo.FtPerM, mid.AltFt, 3);
        Assert.Equal(0, Geo.Turn(0, mid.HeadingDeg), 6);
        Assert.Equal(Math.Atan2(5, 100) * 180 / Math.PI, mid.PitchDeg, 6);
        Assert.Equal(0, mid.BankDeg, 6);
        Assert.Equal(100 * 3600 / 1852.0, mid.GsKt, 3);
    }

    [Fact]
    public void A_standard_rate_turn_to_the_right_banks_right_by_its_rate_and_speed()
    {
        // 90 kt round a circle at 3 degrees a second, clockwise seen from above.
        var speed = 90 * 1852 / 3600.0;
        var rate = 3 * Math.PI / 180;
        var radius = speed / rate;
        Report[] run =
        [
            .. Enumerable.Range(0, 40).Select(i =>
            {
                var a = rate * i;
                var (lat, lon) = Geo.FromLocal(34.8, -111.8, radius * Math.Sin(a), radius * Math.Cos(a));
                return Air(i, lat, lon, 6000);
            }),
        ];
        var at = new FlightPath(run, Height).At(20.5)!;
        var expected = Math.Atan(speed * rate / 9.80665) * 180 / Math.PI;
        Assert.InRange(at.BankDeg, expected - 0.5, expected + 0.5);
        Assert.InRange(expected, 13, 15);
    }

    [Fact]
    public void Nothing_is_answered_outside_the_run()
    {
        var path = new FlightPath([Air(10, 34.8, -111.8, 5000), Air(12, 34.801, -111.8, 5000)], Height);
        Assert.Null(path.At(9.99));
        Assert.Null(path.At(12.01));
    }

    [Fact]
    public void The_heading_does_not_jump_where_two_report_intervals_meet()
    {
        Report[] run = [Air(0, 34.800, -111.800, 5000), Air(1, 34.8003, -111.7998, 5000), Air(2, 34.8005, -111.7994, 5000), Air(3, 34.8006, -111.7989, 5000)];
        var path = new FlightPath(run, Height);
        Assert.InRange(Math.Abs(Geo.Turn(path.At(1 - 1e-6)!.HeadingDeg, path.At(1 + 1e-6)!.HeadingDeg)), 0, 0.01);
    }

    [Fact]
    public void A_stopped_airplane_keeps_the_last_track_it_reported()
    {
        Report[] run =
        [
            new(0, 34.85, -111.78, null, 5, 128, null, 0, false, true),
            new(5, 34.85, -111.78, null, 0, null, null, 0, false, true),
            new(9, 34.85, -111.78, null, 0, null, null, 0, false, true),
        ];
        var at = new FlightPath(run, _ => 4830).At(7)!;
        Assert.True(at.Ground);
        Assert.Equal(128, at.HeadingDeg);
        Assert.Equal(4830, at.AltFt, 6);
        Assert.Equal(0, at.PitchDeg);
        Assert.Equal(0, at.BankDeg);
    }
}
