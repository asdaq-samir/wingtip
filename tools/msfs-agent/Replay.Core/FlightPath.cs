namespace Wingtip.Replay;

/// <summary>Where the airplane is and how it sits at one moment, for the
/// simulator: degrees, ft above the simulator's sea, degrees true, and pitch
/// and bank in degrees (nose up and right wing down positive).</summary>
public sealed record Pose(double T, double Lat, double Lon, double AltFt, double HeadingDeg, double PitchDeg, double BankDeg, double GsKt, bool Ground);

/// <summary>
/// One run of reports (no gap inside it, <see cref="ReadyTrack.Runs"/>) as
/// the engine's sim_flight drew it: frames a tenth of a second apart by
/// default, each with the path's place, height, heading, and the pitch and
/// bank the engine estimated, with its sources (contract/sim_flight.json).
/// The agent holds no rule of its own about any of them: between two
/// frames it eases each figure in proportion, the heading the short way
/// round, as a simulator's own frames come faster than the
/// engine's. Asked a moment outside the run it answers null: a gap is
/// never bridged.
/// </summary>
public sealed class FlightPath
{
    readonly Frame[] _frames;
    readonly double[] _t, _alt;

    public double Start => _t[0];
    public double End => _t[^1];
    /// <summary>The run's reports, for what is told by them rather than by a
    /// moment: whether it starts or ends on the ground, where it touched.</summary>
    public IReadOnlyList<Report> Reports { get; }

    /// <param name="run">The run's reports.</param>
    /// <param name="frames">sim_flight's frames for the same run.</param>
    /// <param name="ftMsl">A frame's height above the simulator's sea (<see cref="Heights.FtMsl"/>).</param>
    public FlightPath(Report[] run, IReadOnlyList<Frame> frames, Func<Frame, double> ftMsl)
    {
        if (frames.Count < 2) throw new ArgumentException("A path needs two frames.", nameof(frames));
        Reports = run;
        _frames = [.. frames];
        _t = [.. _frames.Select(f => f.T)];
        _alt = [.. _frames.Select(ftMsl)];
    }

    /// <summary>
    /// Each run of the track with the segment of frames drawn for it,
    /// matched by time: the segment whose first frame falls within the
    /// run's reports. A run with no segment (the engine leaves out a run of
    /// one report) is left out too.
    /// </summary>
    public static IReadOnlyList<FlightPath> Of(ReadyTrack track, Func<Frame, double> ftMsl)
    {
        var paths = new List<FlightPath>();
        foreach (var run in track.Runs())
        {
            var segment = track.Segments.FirstOrDefault(s => s.Rows.Count >= 2 && s.Rows[0].T >= run[0].T && s.Rows[0].T <= run[^1].T);
            if (segment is not null) paths.Add(new FlightPath(run, segment.Rows, ftMsl));
        }
        return paths;
    }

    /// <summary>The frame interval holding t (Start ≤ t ≤ End).</summary>
    int Interval(double t)
    {
        var i = Array.BinarySearch(_t, t);
        if (i < 0) i = ~i - 1;
        return Math.Clamp(i, 0, _t.Length - 2);
    }

    static double Lerp(double a, double b, double s) => a + (b - a) * s;

    /// <summary>a to b the short way round, degrees.</summary>
    static double LerpAngle(double a, double b, double s) => (a + Geo.Turn(a, b) * s + 360) % 360;

    /// <summary>The airplane at t, or null outside this run.</summary>
    public Pose? At(double t)
    {
        if (t < Start || t > End) return null;
        var i = Interval(t);
        var (a, b) = (_frames[i], _frames[i + 1]);
        var s = (t - a.T) / (b.T - a.T);
        var ground = s < 0.5 ? a.Ground : b.Ground;
        return new Pose(
            t,
            Lerp(a.Lat, b.Lat, s),
            Lerp(a.Lon, b.Lon, s),
            Lerp(_alt[i], _alt[i + 1], s),
            LerpAngle(a.TrackDeg, b.TrackDeg, s),
            Lerp(a.PitchDeg, b.PitchDeg, s),
            Lerp(a.BankDeg, b.BankDeg, s),
            Lerp(a.GsKt, b.GsKt, s),
            ground);
    }
}
