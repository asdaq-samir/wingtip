namespace Wingtip.Replay;

/// <summary>
/// Where the airplane goes up and down in the simulator. The reports carry
/// the transponder's pressure altitude (DO-260B, readsb's alt_baro, as the
/// Studio export says in <c>altitude: "pressure"</c>), which is the height
/// above the 29.92 inHg level, not above the sea: on the Sedona fixture's
/// day the airplane lifts off at a reported 4,500 ft from a field at 4,830
/// (KSEZ, the FAA's airport data), so drawn as sent it would fly under the
/// runway. The simulator wants a height above its own sea and over its own
/// ground, so the agent measures that ground where the reports say the
/// airplane touched it (an airborne report next to a ground one) and moves
/// the whole flight by one figure, the middle of those differences. It is
/// one figure because the altimeter setting barely changes in a short
/// flight, and it is measured in the simulator rather than worked out from
/// a METAR because what has to match is the simulator's terrain, not the
/// FAA's elevation. No aviation rule is applied here, so none is copied
/// from the engine.
/// </summary>
public sealed class Heights
{
    readonly (Report At, double GroundFt)[] _measured;

    /// <summary>The figure every airborne report is moved by, ft.</summary>
    public double OffsetFt { get; }

    public Heights(IEnumerable<(Report At, double GroundFt)> measured, double? offsetFt = null)
    {
        _measured = [.. measured];
        var differences = _measured.Where(m => m.At.AltFt is not null).Select(m => m.GroundFt - m.At.AltFt!.Value).Order().ToArray();
        OffsetFt = offsetFt ?? (differences.Length == 0 ? 0 : Median(differences));
    }

    /// <summary>
    /// The airborne reports next to a ground report in the same run: the
    /// places where the simulator's ground is to be measured. Next to means
    /// the report before or after, which in a run is within the engine's
    /// gap_s (60 s) of it; readsb's reports thin out near the ground, so
    /// the Sedona fixture's are 34 and 44 s from the runway.
    /// </summary>
    public static IReadOnlyList<Report> Anchors(IEnumerable<Report[]> runs)
    {
        var found = new List<Report>();
        foreach (var run in runs)
        {
            for (var i = 1; i < run.Length; i++)
            {
                var (a, b) = (run[i - 1], run[i]);
                if (a.Ground == b.Ground) continue;
                var air = a.Ground ? b : a;
                if (air.AltFt is not null && !found.Contains(air)) found.Add(air);
            }
        }
        return found;
    }

    /// <summary>
    /// A report's height in the simulator, ft above its sea: an airborne
    /// report's moved by <see cref="OffsetFt"/>; a ground report's the
    /// ground measured nearest it, or, where none was, the nearest airborne
    /// report's in time, moved.
    /// </summary>
    public double FtMsl(Report r, IReadOnlyList<Report> run)
    {
        if (!r.Ground && r.AltFt is { } alt) return alt + OffsetFt;
        if (_measured.Length > 0)
            return _measured.MinBy(m => Geo.DistanceM(r.Lat, r.Lon, m.At.Lat, m.At.Lon)).GroundFt;
        var air = run.Where(p => !p.Ground && p.AltFt is not null).MinBy(p => Math.Abs(p.T - r.T));
        return air is null ? 0 : air.AltFt!.Value + OffsetFt;
    }

    static double Median(double[] sorted) =>
        sorted.Length % 2 == 1 ? sorted[sorted.Length / 2] : (sorted[sorted.Length / 2 - 1] + sorted[sorted.Length / 2]) / 2;
}
