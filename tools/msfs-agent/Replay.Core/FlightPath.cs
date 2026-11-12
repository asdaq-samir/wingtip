namespace Wingtip.Replay;

/// <summary>Where the airplane is and how it sits at one moment, for the
/// simulator: degrees, ft above the simulator's sea, degrees true, and pitch
/// and bank in degrees (nose up and right wing down positive).</summary>
public sealed record Pose(double T, double Lat, double Lon, double AltFt, double HeadingDeg, double PitchDeg, double BankDeg, double GsKt, bool Ground);

/// <summary>
/// One run of reports (no gap inside it, <see cref="ReadyTrack.Runs"/>)
/// as a smooth path: a cubic Hermite curve through every report in east,
/// north and height, its slopes from the reports either side, so the
/// airplane passes through each report and never jerks at one. Asked a
/// moment outside the run it answers null: a gap is never bridged.
/// The heading follows the path; the pitch is the climb's angle and the
/// bank the one a coordinated turn at that rate and speed needs, which is
/// how the airplane looked rather than a figure for a pilot, and fine for
/// a camera; a report carrying no attitude gives nothing better.
/// </summary>
public sealed class FlightPath
{
    /// <summary>Standard gravity, m/s² (ISO 80000-3, 9.80665).</summary>
    const double G = 9.80665;
    const double KtPerMps = 3600 / 1852.0;
    /// <summary>Below this speed the path's own direction is noise, m/s
    /// (about 6 kt): the heading is the reports' track instead.</summary>
    const double SlowMps = 3;
    /// <summary>Half the window the turn rate is read over, s.</summary>
    const double TurnHalfS = 1.5;
    /// <summary>The most bank drawn, degrees: past it a report's noise, not
    /// a turn a light airplane flies on a sightseeing flight.</summary>
    const double MostBankDeg = 60;

    readonly Report[] _run;
    readonly double[] _t, _e, _n, _h, _me, _mn, _mh;
    readonly double _lat0, _lon0;

    public double Start => _t[0];
    public double End => _t[^1];
    public IReadOnlyList<Report> Reports => _run;

    public FlightPath(Report[] run, Func<Report, double> ftMsl)
    {
        if (run.Length < 2) throw new ArgumentException("A path needs two reports.", nameof(run));
        _run = run;
        (_lat0, _lon0) = (run[0].Lat, run[0].Lon);
        _t = [.. run.Select(r => r.T)];
        var local = run.Select(r => Geo.ToLocal(_lat0, _lon0, r.Lat, r.Lon)).ToArray();
        _e = [.. local.Select(p => p.E)];
        _n = [.. local.Select(p => p.N)];
        _h = [.. run.Select(r => ftMsl(r) / Geo.FtPerM)];
        _me = Slopes(_t, _e);
        _mn = Slopes(_t, _n);
        _mh = Slopes(_t, _h);
    }

    /// <summary>Each report's slope: the mean of the two either side of it,
    /// one-sided at the ends (finite-difference Hermite tangents).</summary>
    static double[] Slopes(double[] t, double[] x)
    {
        var d = new double[x.Length - 1];
        for (var i = 0; i < d.Length; i++) d[i] = (x[i + 1] - x[i]) / (t[i + 1] - t[i]);
        var m = new double[x.Length];
        m[0] = d[0];
        m[^1] = d[^1];
        for (var i = 1; i < x.Length - 1; i++) m[i] = (d[i - 1] + d[i]) / 2;
        return m;
    }

    /// <summary>The report interval holding t (Start ≤ t ≤ End).</summary>
    int Interval(double t)
    {
        var i = Array.BinarySearch(_t, t);
        if (i < 0) i = ~i - 1;
        return Math.Clamp(i, 0, _t.Length - 2);
    }

    static (double X, double V) Hermite(double t0, double t1, double x0, double x1, double m0, double m1, double t)
    {
        var dt = t1 - t0;
        var s = (t - t0) / dt;
        var (s2, s3) = (s * s, s * s * s);
        var x = (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * dt * m0 + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * dt * m1;
        var v = (6 * s2 - 6 * s) / dt * x0 + (3 * s2 - 4 * s + 1) * m0 + (-6 * s2 + 6 * s) / dt * x1 + (3 * s2 - 2 * s) * m1;
        return (x, v);
    }

    (double E, double N, double H, double Ve, double Vn, double Vh) Eval(double t)
    {
        var i = Interval(t);
        var (e, ve) = Hermite(_t[i], _t[i + 1], _e[i], _e[i + 1], _me[i], _me[i + 1], t);
        var (n, vn) = Hermite(_t[i], _t[i + 1], _n[i], _n[i + 1], _mn[i], _mn[i + 1], t);
        var (h, vh) = Hermite(_t[i], _t[i + 1], _h[i], _h[i + 1], _mh[i], _mh[i + 1], t);
        return (e, n, h, ve, vn, vh);
    }

    /// <summary>The heading at t: the path's direction, or where it is too
    /// slow to have one, the track of the nearest report before t that has
    /// one (a stopped airplane keeps its last heading).</summary>
    double HeadingAt(double t)
    {
        var p = Eval(t);
        if (Math.Sqrt(p.Ve * p.Ve + p.Vn * p.Vn) >= SlowMps) return Geo.Bearing(p.Ve, p.Vn);
        for (var i = Interval(t) + 1; i >= 0; i--)
        {
            if (_run[i].T <= t + 1e-9 && _run[i].TrackDeg is { } track) return track;
        }
        return _run.FirstOrDefault(r => r.TrackDeg is not null)?.TrackDeg ?? 0;
    }

    /// <summary>The airplane at t, or null outside this run.</summary>
    public Pose? At(double t)
    {
        if (t < Start || t > End) return null;
        var p = Eval(t);
        var i = Interval(t);
        var ground = (_run[i].Ground && _run[i + 1].Ground) || (t >= _run[i + 1].T && _run[i + 1].Ground);
        var (lat, lon) = Geo.FromLocal(_lat0, _lon0, p.E, p.N);
        var speed = Math.Sqrt(p.Ve * p.Ve + p.Vn * p.Vn);
        var heading = HeadingAt(t);
        if (ground) return new Pose(t, lat, lon, p.H * Geo.FtPerM, heading, 0, 0, speed * KtPerMps, true);

        var pitch = Math.Atan2(p.Vh, Math.Max(speed, SlowMps)) * 180 / Math.PI;
        var (before, after) = (Math.Max(Start, t - TurnHalfS), Math.Min(End, t + TurnHalfS));
        var rate = after > before ? Geo.Turn(HeadingAt(before), HeadingAt(after)) / (after - before) * Math.PI / 180 : 0;
        // A coordinated turn's bank: tan(bank) = V * turn rate / g (the
        // forces in a level turn, FAA-H-8083-25C ch. 5).
        var bank = Math.Clamp(Math.Atan(speed * rate / G) * 180 / Math.PI, -MostBankDeg, MostBankDeg);
        return new Pose(t, lat, lon, p.H * Geo.FtPerM, heading, pitch, bank, speed * KtPerMps, false);
    }
}
