namespace Wingtip.Replay;

/// <summary>
/// Flat local geometry for easing an airplane between reports a second or
/// two apart and for placing a camera a few hundred metres from it: east
/// and north metres on a plane touching the earth at a reference point. Over
/// the 20 nm of a local flight it is off by well under a metre, less than a
/// report's own error; no navigation figure is worked out with it.
/// </summary>
public static class Geo
{
    /// <summary>The earth's mean radius, m (IUGG's R1, 6,371,008.8 m).</summary>
    const double EarthM = 6_371_008.8;

    public const double FtPerM = 1 / 0.3048;

    static double Rad(double deg) => deg * Math.PI / 180;

    /// <summary>East and north metres from (lat0, lon0) to (lat, lon).</summary>
    public static (double E, double N) ToLocal(double lat0, double lon0, double lat, double lon) =>
        (Rad(lon - lon0) * Math.Cos(Rad(lat0)) * EarthM, Rad(lat - lat0) * EarthM);

    /// <summary>The point east and north metres from (lat0, lon0).</summary>
    public static (double Lat, double Lon) FromLocal(double lat0, double lon0, double e, double n) =>
        (lat0 + n / EarthM * 180 / Math.PI, lon0 + e / (EarthM * Math.Cos(Rad(lat0))) * 180 / Math.PI);

    public static double DistanceM(double lat1, double lon1, double lat2, double lon2)
    {
        var (e, n) = ToLocal(lat1, lon1, lat2, lon2);
        return Math.Sqrt(e * e + n * n);
    }

    /// <summary>A direction, degrees true from north, 0 to 360.</summary>
    public static double Bearing(double e, double n) => (Math.Atan2(e, n) * 180 / Math.PI + 360) % 360;

    /// <summary>b - a, the shorter way round, -180 to 180 degrees.</summary>
    public static double Turn(double a, double b) => ((b - a) % 360 + 540) % 360 - 180;
}
