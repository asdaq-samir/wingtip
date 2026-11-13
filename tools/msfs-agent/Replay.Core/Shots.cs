using System.Globalization;
using System.Text.Json;

namespace Wingtip.Replay;

public enum ShotKind { Chase, Flyby, Tower, Cockpit }

/// <summary>One line of a shot list: a camera and how long it holds, s.</summary>
public sealed record ShotSpec(ShotKind Kind, double Seconds);

/// <summary>A camera from one moment to another of a run (s since 1970).</summary>
public sealed record Shot(ShotKind Kind, double From, double To);

/// <summary>Where a camera is put, relative to what. In the airplane's own
/// frame and the pilot's eye, metres right, up and forward (SimConnect's
/// SimObject and Eyepoint referentials); in the world, latitude, longitude
/// and ft above the simulator's sea.</summary>
public enum CameraFrame { Airplane, Eyepoint, World }

/// <summary>A camera for the simulator's add-on camera (the SimConnect
/// Camera API): where, whether it looks at the airplane or straight ahead
/// of the frame, and its field of view, degrees.</summary>
public sealed record Camera(CameraFrame Frame, double X, double Y, double Z, bool LooksAtAirplane, double FovDeg);

/// <summary>
/// The shot list, laid over the runs: the list's cameras in turn from a
/// run's start, and the tower's for the first and last seconds of a run
/// that starts or ends on the ground, so a take-off and a landing are seen
/// from beside the runway. No shot crosses from one run to the next.
/// </summary>
public static class ShotList
{
    /// <summary>How long the tower watches a take-off or a landing, s.</summary>
    public const double TowerS = 40;
    /// <summary>A shot cut shorter than this at a run's end is given to the
    /// one before it instead, s: a cut that quick reads as a glitch.</summary>
    const double ShortestS = 5;

    /// <summary>The kinds a shot may be, as the shot list's schema names
    /// them (tools/xplane-driver/wingtip_replay/shots.schema.json, the one
    /// the X-Plane plugin reads too, embedded here); ShotKind is held to
    /// them by ShotTests.</summary>
    public static readonly IReadOnlyList<string> Kinds = SchemaKinds();

    static string[] SchemaKinds()
    {
        using var schema = typeof(ShotList).Assembly.GetManifestResourceStream("shots.schema.json")
            ?? throw new InvalidOperationException("The shot list's schema is not in Replay.Core.");
        using var doc = JsonDocument.Parse(schema);
        var kind = doc.RootElement.GetProperty("properties").GetProperty("shots").GetProperty("items")
            .GetProperty("properties").GetProperty("kind").GetProperty("enum");
        return [.. kind.EnumerateArray().Select(k => k.GetString() ?? "")];
    }

    public static readonly IReadOnlyList<ShotSpec> Default =
    [
        new(ShotKind.Chase, 45),
        new(ShotKind.Flyby, 14),
        new(ShotKind.Cockpit, 40),
        new(ShotKind.Chase, 30),
        new(ShotKind.Flyby, 14),
    ];

    /// <summary>"chase:45,flyby:14,cockpit:40" as a list.</summary>
    public static IReadOnlyList<ShotSpec> Parse(string text) =>
    [
        .. text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(part =>
        {
            var bits = part.Split(':');
            if (bits.Length != 2 || !Kinds.Contains(bits[0].ToLowerInvariant()) || !Enum.TryParse<ShotKind>(bits[0], true, out var kind)
                || !double.TryParse(bits[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var s) || s <= 0)
                throw new FormatException($"\"{part}\" is not a shot: write camera:seconds, one of {string.Join(", ", Kinds)}.");
            return new ShotSpec(kind, s);
        }),
    ];

    public static IReadOnlyList<Shot> Plan(IReadOnlyList<FlightPath> paths, IReadOnlyList<ShotSpec> specs)
    {
        if (specs.Count == 0) throw new ArgumentException("The shot list is empty.", nameof(specs));
        var shots = new List<Shot>();
        var next = 0;
        foreach (var path in paths)
        {
            var (from, to) = (path.Start, path.End);
            var run = new List<Shot>();
            if (path.Reports[0].Ground && to - from > 2 * TowerS)
            {
                run.Add(new Shot(ShotKind.Tower, from, from + TowerS));
                from += TowerS;
            }
            Shot? landing = null;
            if (path.Reports[^1].Ground && to - from > 2 * TowerS)
            {
                landing = new Shot(ShotKind.Tower, to - TowerS, to);
                to -= TowerS;
            }
            for (var t = from; t < to;)
            {
                var spec = specs[next++ % specs.Count];
                var end = Math.Min(t + spec.Seconds, to);
                if (end - t < ShortestS && run.Count > 0) run[^1] = run[^1] with { To = end };
                else run.Add(new Shot(spec.Kind, t, end));
                t = end;
            }
            if (landing is not null) run.Add(landing);
            shots.AddRange(run);
        }
        return shots;
    }

    /// <summary>
    /// The camera for a shot. A flyby is a point beside where the airplane
    /// will be a few seconds into the shot, held while it passes; the tower
    /// is the point given. The others ride with the airplane.
    /// </summary>
    public static Camera CameraFor(Shot shot, FlightPath path, (double Lat, double Lon, double AltFt) tower) => shot.Kind switch
    {
        ShotKind.Chase => new Camera(CameraFrame.Airplane, 0, 3, -22, true, 60),
        ShotKind.Cockpit => new Camera(CameraFrame.Eyepoint, 0, 0, 0, false, 70),
        ShotKind.Tower => new Camera(CameraFrame.World, tower.Lat, tower.Lon, tower.AltFt, true, 25),
        _ => Flyby(shot, path),
    };

    /// <summary>40 m to the right of the path and 15 ft above the airplane, 6 s
    /// into the shot (or the shot's middle, for a short one).</summary>
    static Camera Flyby(Shot shot, FlightPath path)
    {
        var at = path.At(Math.Min(shot.From + 6, (shot.From + shot.To) / 2))
            ?? throw new ArgumentException("A shot outside its run.", nameof(shot));
        var right = (at.HeadingDeg + 90) * Math.PI / 180;
        var (lat, lon) = Geo.FromLocal(at.Lat, at.Lon, 40 * Math.Sin(right), 40 * Math.Cos(right));
        return new Camera(CameraFrame.World, lat, lon, at.AltFt + 15, true, 40);
    }

    /// <summary>A spot beside a touchdown to watch from: 250 m to the left of
    /// the airplane's track there, so it looks across the runway.</summary>
    public static (double Lat, double Lon) TowerSpot(Report touchdown)
    {
        var left = ((touchdown.TrackDeg ?? 0) - 90) * Math.PI / 180;
        return Geo.FromLocal(touchdown.Lat, touchdown.Lon, 250 * Math.Sin(left), 250 * Math.Cos(left));
    }
}
