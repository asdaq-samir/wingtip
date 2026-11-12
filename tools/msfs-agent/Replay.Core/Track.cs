using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wingtip.Replay;

/// <summary>
/// One report of a track made ready by the engine's replay_track
/// (engine/crates/route/contract/replay_track.json, its ReplaySample):
/// when (s since 1970), where, the pressure altitude (ft, null on the
/// ground), ground speed (kt), track (degrees true), vertical speed
/// (ft/min), how far along (nm), whether a gap comes before it, and
/// whether it was on the ground.
/// </summary>
public sealed record Report(
    double T,
    double Lat,
    double Lon,
    double? AltFt,
    double? GsKt,
    double? TrackDeg,
    double? VsFpm,
    double AlongNm,
    bool Gap,
    bool Ground);

/// <summary>No report heard from <c>From</c> to <c>To</c> (s since 1970).</summary>
public sealed record GapSpan(double From, double To);

/// <summary>
/// A flight as tools/msfs-agent/prepare-track.sh writes it: the Studio
/// export's own fields (who, which day, what the altitude is, where it came
/// from and under what licence) and the engine's ready reports and gaps.
/// </summary>
public sealed record ReadyTrack(
    string Hex,
    string? Registration,
    string? Type,
    string Day,
    string Altitude,
    string Source,
    string License,
    IReadOnlyList<Report> Points,
    IReadOnlyList<GapSpan> Gaps)
{
    static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    public static ReadyTrack Read(string path) => Parse(File.ReadAllText(path));

    public static ReadyTrack Parse(string json)
    {
        var track = JsonSerializer.Deserialize<ReadyTrack>(json, Json)
            ?? throw new InvalidDataException("The track is empty.");
        if (track.Points is null || track.Points.Count < 2)
            throw new InvalidDataException("The track has fewer than two reports.");
        for (var i = 1; i < track.Points.Count; i++)
        {
            if (track.Points[i].T <= track.Points[i - 1].T)
                throw new InvalidDataException(
                    $"Report {i} is not after the one before it: run the export through prepare-track.sh, which makes it ready.");
        }
        return track with { Gaps = track.Gaps ?? [] };
    }

    /// <summary>
    /// The runs of reports with no gap inside them. A run ends where the
    /// engine marked the next report <c>gap</c> or a listed gap falls
    /// between two reports; nothing is ever eased across one (the engine's
    /// rule: "nothing smoothed or interpolated across it"). A run of one
    /// report is no flight to show and is left out.
    /// </summary>
    public IReadOnlyList<Report[]> Runs()
    {
        var runs = new List<Report[]>();
        var run = new List<Report> { Points[0] };
        for (var i = 1; i < Points.Count; i++)
        {
            var (a, b) = (Points[i - 1], Points[i]);
            if (b.Gap || Gaps.Any(g => a.T <= g.From && b.T >= g.To))
            {
                if (run.Count >= 2) runs.Add([.. run]);
                run = [];
            }
            run.Add(b);
        }
        if (run.Count >= 2) runs.Add([.. run]);
        return runs;
    }
}
