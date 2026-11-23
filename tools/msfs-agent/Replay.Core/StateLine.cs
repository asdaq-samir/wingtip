using System.Globalization;
using System.Text.Json;

namespace Wingtip.Replay;

/// <summary>
/// The airplane where the replay put it, as the test flight's feed reads it
/// (tools/sim-flight/sim_flight/state.py, docs/SIM-FLIGHT.md): one JSON
/// object a UDP datagram, at most one a second of the flight's clock. The
/// feed sends it on to the phones as GDL 90 and to the web's browser test as
/// its GPS. Feet and knots, as the pose has them: the feed converts.
/// </summary>
public sealed class StateLine(DateTime start)
{
    /// <summary>Once a second, as a GPS and a GDL 90 receiver report.</summary>
    public const double EverySeconds = 1.0;

    int _seq;
    double? _lastT;

    /// <summary>The line for <paramref name="pose"/>, or null where a second
    /// has not passed since the last one (or the clock went back, a cut).</summary>
    public string? For(Pose pose)
    {
        if (_lastT is { } last && pose.T - last < EverySeconds && pose.T >= last)
            return null;
        _lastT = pose.T;
        _seq++;
        return JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["sim"] = "msfs",
            ["seq"] = _seq,
            ["t"] = Math.Round(pose.T, 2),
            ["utc"] = Utc(pose),
            ["lat"] = pose.Lat,
            ["lon"] = pose.Lon,
            ["alt_ft"] = Math.Round(pose.AltFt, 1),
            ["gs_kt"] = Math.Round(pose.GsKt, 1),
            ["track_deg"] = Math.Round(pose.HeadingDeg, 1),
            ["on_ground"] = pose.Ground,
            ["phase"] = pose.Ground ? "ground" : "air",
            ["point"] = "",
            ["next"] = "",
            ["done"] = false,
        });
    }

    /// <summary>The last line, saying the flight is over.</summary>
    public string Done(Pose pose) => JsonSerializer.Serialize(new Dictionary<string, object?>
    {
        ["sim"] = "msfs",
        ["seq"] = ++_seq,
        ["t"] = Math.Round(pose.T, 2),
        ["utc"] = Utc(pose),
        ["lat"] = pose.Lat,
        ["lon"] = pose.Lon,
        ["alt_ft"] = Math.Round(pose.AltFt, 1),
        ["gs_kt"] = 0.0,
        ["on_ground"] = pose.Ground,
        ["done"] = true,
    });

    /// <summary>The pose's moment, Unix seconds: the replay's start and the track's time.</summary>
    double Utc(Pose pose) => new DateTimeOffset(DateTime.SpecifyKind(start, DateTimeKind.Utc)).ToUnixTimeMilliseconds() / 1000.0 + pose.T;

    /// <summary>HOST:PORT read, as --feed takes it.</summary>
    public static (string Host, int Port) Address(string text)
    {
        var at = text.LastIndexOf(':');
        if (at > 0 && int.TryParse(text[(at + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out var port) && port is > 0 and < 65536)
            return (text[..at], port);
        throw new FormatException($"--feed {text}: write HOST:PORT");
    }
}
