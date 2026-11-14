import Foundation

/// Every figure the app writes, written here and nowhere else: the UI
/// audit of 2026-11-09 (item 3) found the same altitude written "FL-045",
/// "025" and "4,500 ft" and a time "2h 06m", "1h 5m" and "2 h 13 min" on
/// one phone. Each form below is a row of the shared table,
/// apps/web/src/lib/fixtures/formats.json (generated from design/tokens.json
/// by scripts/build/design-tokens.sh), which the web's formatters and
/// FormatTests here are both held to, so the iPhone writes a figure as the
/// web does. No figure is worked out here, only written.
///
/// The locale is fixed to en_US on purpose: figures are written as the FAA
/// prints them ("10,162 ft", "12.3 nm") whatever the phone's region.
enum Format {
    /// The locale every figure is written in.
    static let locale = Locale(identifier: "en_US")
    /// What is written for a figure not known, which is not zero.
    static let none = "—"

    // MARK: The shared table (formats.json)

    /// A cruising altitude on the cruise controls, the profile and the
    /// route box: "FL-045", against FAA usage on purpose (docs/decisions/0009).
    static func cruiseAltitude(_ ft: Double?) -> String {
        guard let ft else { return "FL-___" }
        return "FL-\(hundreds(ft))"
    }

    /// An altitude on the map's weather (AIRMETs, SIGMETs, PIREPs): "FL045"
    /// (docs/decisions/0009).
    static func mapLevel(_ ft: Double) -> String { "FL\(hundreds(ft))" }

    /// Any other altitude, height or elevation, grouped feet: "4,500 ft".
    static func altitude(_ ft: Double?) -> String {
        guard let ft else { return none }
        return "\(grouped(ft)) ft"
    }

    /// The altitudes a route flies, lowest to highest: "3,500–5,500 ft",
    /// one figure where they are the same.
    static func altitudeRange(_ low: Double, _ high: Double) -> String {
        grouped(low) == grouped(high) ? altitude(low) : "\(grouped(low))–\(grouped(high)) ft"
    }

    /// A time aloft, a time left or an age, in minutes, as the web's
    /// Intl.DurationFormat writes it narrow: "1h 5m", "45m", "3h", "0m".
    static func duration(_ minutes: Double) -> String {
        let whole = max(0, Int(minutes.rounded()))
        let (h, m) = (whole / 60, whole % 60)
        switch (h, m) {
        case (0, _): return "\(m)m"
        case (_, 0): return "\(h)h"
        default: return "\(h)h \(m)m"
        }
    }

    /// A leg's time en route as a paper nav log writes it: "0:18".
    static func navLogTime(_ minutes: Double) -> String {
        let whole = max(0, Int(minutes.rounded()))
        return "\(whole / 60):\(String(whole % 60).leftPadded(to: 2))"
    }

    /// A UTC clock time as reports and flight plans give it: "1432Z".
    static func zulu(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(parts.hour ?? 0).leftPadded(to: 2) + String(parts.minute ?? 0).leftPadded(to: 2) + "Z"
    }

    /// A course, heading, track or wind direction: three figures, whole
    /// degrees, north as 360 (FAA Order JO 7110.65, 2-4-17): "045°".
    static func heading(_ deg: Double) -> String {
        let whole = (Int(deg.rounded()) % 360 + 360) % 360
        return "\(String(whole == 0 ? 360 : whole).leftPadded(to: 3))°"
    }

    /// Nautical miles to a tenth, as the planner sends them: "102.4 nm";
    /// `decimals: 0` for a distance only roughly meant ("12 nm of you").
    /// Another airplane's reported altitude to the hundred feet, "4,500
    /// ft": as ATC gives traffic's altitude in hundreds of feet (FAA Order
    /// JO 7110.65, 2-1-21), one form wherever a target is shown (the
    /// web's trafficFt, WEB-38 and CODE-34), where the airplane's card
    /// rounded to 25 ft and the find list to 100.
    static func trafficAltitude(_ ft: Double?) -> String {
        altitude(ft.map(trafficFeet))
    }

    /// A target's altitude rounded to the hundred feet, for saying it.
    static func trafficFeet(_ ft: Double) -> Double { (ft / 100).rounded() * 100 }

    static func distance(_ nm: Double?, decimals: Int = 1) -> String {
        guard let nm else { return none }
        return "\(number(nm, decimals: decimals)) nm"
    }

    /// An airspeed, a ground speed or a wind speed, whole knots: "110 kt".
    static func speed(_ kt: Double?) -> String {
        guard let kt else { return none }
        return "\(grouped(kt)) kt"
    }

    /// Fuel in US gallons to a tenth: "12.0 gal"; `decimals: 0` for a
    /// tank's size.
    static func fuel(_ gal: Double?, decimals: Int = 1) -> String {
        guard let gal else { return none }
        return "\(number(gal, decimals: decimals)) gal"
    }

    /// A weight, grouped pounds: "2,450 lb".
    static func weight(_ lb: Double) -> String { "\(grouped(lb)) lb" }

    /// A wind correction angle: plus to the right, a minus sign to the left.
    static func windCorrection(_ deg: Double) -> String {
        let whole = Int(deg.rounded())
        return whole == 0 ? "0°" : whole > 0 ? "+\(whole)°" : "\u{2212}\(-whole)°"
    }

    /// Magnetic variation as the sectional's isogonic lines write it
    /// (FAA-H-8083-25C, chapter 16): "5° E", "3° W".
    static func variation(_ deg: Double) -> String {
        let whole = Int(deg.rounded())
        return whole == 0 ? "0°" : "\(abs(whole))° \(whole > 0 ? "E" : "W")"
    }

    // MARK: Numbers the forms are built from

    /// Three figures of hundreds of feet: 4,500 is "045".
    private static func hundreds(_ ft: Double) -> String {
        String(max(0, Int((ft / 100).rounded()))).leftPadded(to: 3)
    }

    /// A whole number grouped as pilots read it: "10,162"; rounded
    /// schoolbook-style first (2.5 is 3), and never "-0".
    static func grouped(_ n: Double) -> String {
        let whole = n.rounded()
        return (whole == 0 ? 0 : whole).formatted(.number.precision(.fractionLength(0)).locale(locale))
    }

    /// A figure to so many places, rounded half away from zero as the web's
    /// toFixed reads to a pilot (32.25 gal is 32.3): "12.3", "0.0".
    static func number(_ x: Double, decimals: Int) -> String {
        let scale = pow(10, Double(decimals))
        let rounded = (x * scale).rounded(.toNearestOrAwayFromZero) / scale
        return (rounded == 0 ? 0 : rounded).formatted(.number.precision(.fractionLength(decimals)).grouping(.never).locale(locale))
    }

    /// A figure to a tenth, without a ".0" it does not have: "3", "1.5".
    static func tenths(_ x: Double) -> String {
        x == x.rounded() && abs(x) < 1e9 ? String(Int(x)) : number(x, decimals: 1)
    }

    /// Hours to a tenth as a logbook keeps them, "1.5 h".
    static func hours(_ h: Double, decimals: Int = 1) -> String { "\(number(h, decimals: decimals)) h" }

    // MARK: Dates

    /// A clock time in the phone's own style, "2:07 PM".
    static func time(_ date: Date) -> String { date.formatted(date: .omitted, time: .shortened) }

    /// A day in the phone's own style, "Nov 3, 2026".
    static func day(_ date: Date) -> String { date.formatted(date: .abbreviated, time: .omitted) }
}

extension String {
    /// Padded with zeros on the left to a width, "7" to "007".
    func leftPadded(to width: Int) -> String {
        count >= width ? self : String(repeating: "0", count: width - count) + self
    }
}
