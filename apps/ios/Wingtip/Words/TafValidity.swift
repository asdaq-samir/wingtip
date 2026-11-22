import Foundation

/// A TAF's own times, and whether it speaks for now (the web's
/// features/place/tafValidity.ts): the engine's `taf_validity`
/// (FAA-H-8083-28B 27.4.1: a TAF is a forecast for its valid period), so a
/// TAF the card kept from before the signal was lost is never read as
/// today's forecast (14 CFR 91.103). Only the words are here.
enum TafValidity {
    /// The line and whether it is a caution; nil for words that are not
    /// a TAF, or where the engine refused.
    static func line(_ taf: String, now: Date) -> (line: String, caution: Bool)? {
        let answer: EngineContract.TafValidityAnswer?
        do {
            answer = try Engine.tafValidity(taf: taf, now: now.timeIntervalSince1970.rounded(.down))
        } catch {
            // Refused: no line rather than a guessed one; the periods and
            // the TAF as sent still show under it.
            return nil
        }
        guard let v = answer else { return nil }
        switch v.state {
        case "expired": return ("TAF expired \(dayZulu(v.validTo)): no forecast in force", true)
        case "not_yet": return ("TAF issued \(dayZulu(v.issued)), valid from \(dayZulu(v.validFrom))", false)
        default: return ("TAF issued \(dayZulu(v.issued)), valid to \(dayZulu(v.validTo))", false)
        }
    }

    /// A TAF time as its header writes one, the UTC day and the time:
    /// "12 1200Z".
    static func dayZulu(_ seconds: Double) -> String {
        let at = Date(timeIntervalSince1970: seconds)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return "\(calendar.component(.day, from: at)) \(Format.zulu(at))"
    }
}
