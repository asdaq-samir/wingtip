import Foundation

// Apart from Format.swift, which the widgets share without the engine: the
// app alone asks the engine how a report writes a visibility.
extension Format {
    /// A visibility as a whole and a fraction of a statute mile, as a METAR
    /// writes it: 1.625 is (1, "5/8"), 10 is (10, nil). The value is the
    /// engine's visibility_reportable, the reportable one at or below it
    /// (FMH-1 Table 6-1), as the web's reportedVisibility asks it: a
    /// visibility rounded up is more than was seen, and no report writes
    /// 11/16. Should the engine not answer, the whole mile below, never more.
    static func reportedVisibility(_ sm: Double) -> (whole: Int, fraction: String?) {
        let reported = (try? Engine.visibilityReportable(sm: sm)) ?? (sm + 1e-9).rounded(.down)
        let whole = Int((reported + 1e-9).rounded(.down))
        // Every reportable value under 3 is a whole number of sixteenths.
        let sixteenths = Int(((reported - Double(whole)) * 16).rounded())
        guard sixteenths > 0 else { return (whole, nil) }
        var (n, d) = (sixteenths, 16)
        while n % 2 == 0 { n /= 2; d /= 2 }
        return (whole, "\(n)/\(d)")
    }
}
