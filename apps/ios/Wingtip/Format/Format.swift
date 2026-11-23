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
nonisolated enum Format {
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
    /// Foundation's own duration style (Duration.UnitsFormatStyle, narrow,
    /// the hours and minutes only, a zero unit left out), the same CLDR
    /// words the web's Intl.DurationFormat writes, in place of the
    /// hand-built switch.
    static func duration(_ minutes: Double) -> String {
        whole(minutes).formatted(.units(allowed: [.hours, .minutes], width: .narrow).locale(locale))
    }

    /// A leg's time en route as a paper nav log writes it: "0:18"
    /// (Duration.TimeFormatStyle's hour-minute pattern).
    static func navLogTime(_ minutes: Double) -> String {
        whole(minutes).formatted(.time(pattern: .hourMinute).locale(locale))
    }

    /// Minutes as a stopwatch counts them, "7:05", minutes past an hour
    /// still minutes (Duration.TimeFormatStyle's minute-second pattern).
    static func stopwatch(_ seconds: Double) -> String {
        Duration.seconds(max(0, seconds.rounded(.down))).formatted(.time(pattern: .minuteSecond).locale(locale))
    }

    /// Minutes rounded to the whole minute, never below zero, as a Duration.
    private static func whole(_ minutes: Double) -> Duration {
        .seconds(max(0, minutes.rounded()) * 60)
    }

    /// A UTC clock time as reports and flight plans give it: "1432Z".
    static func zulu(_ date: Date) -> String { date.formatted(zuluStyle) }

    /// A clock time, 24-hour, in a zone (the phone's own by default),
    /// "09:05", as the web app's clockTime writes it.
    static func clock(_ date: Date, in zone: TimeZone = .current) -> String {
        date.formatted(clockStyle(zone))
    }

    /// The day an arrival is written with where it is not the day the
    /// flight left, as the web's arrivalDay: "Tue" within the week, "11/30"
    /// a week or more on, each day counted in its own zone (the arrival's
    /// field's, the departure's; this phone's where one has none); nil on
    /// the same day. A flight left at 14:27 and said "15:54", the next
    /// day's, read as 87 minutes on for 2,700 nm (the owner's iPhone,
    /// 2026-11-23).
    static func arrivalDay(_ at: Date, left: Date, zone: TimeZone? = nil, leftZone: TimeZone? = nil) -> String? {
        var there = Calendar(identifier: .gregorian)
        there.timeZone = zone ?? .current
        var home = Calendar(identifier: .gregorian)
        home.timeZone = leftZone ?? .current
        // Each end's calendar day as a UTC midnight, so the count is whole days.
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        func midnight(_ date: Date, _ calendar: Calendar) -> Date {
            utc.date(from: calendar.dateComponents([.year, .month, .day], from: date)) ?? date
        }
        let days = utc.dateComponents([.day], from: midnight(left, home), to: midnight(at, there)).day ?? 0
        if days == 0 { return nil }
        if days > 0 && days < 7 {
            return at.formatted(Date.FormatStyle(locale: locale, calendar: there, timeZone: there.timeZone).weekday(.abbreviated))
        }
        let day = there.dateComponents([.month, .day], from: at)
        return "\(day.month ?? 0)/\(day.day ?? 0)"
    }

    /// Foundation's verbatim date styles: Sendable values with the
    /// pattern fixed, so no DateFormatter or calendar sums are kept here.
    private static let zuluStyle = Date.VerbatimFormatStyle(
        format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased))\(minute: .twoDigits)Z",
        locale: locale, timeZone: .gmt, calendar: Calendar(identifier: .gregorian))
    private static func clockStyle(_ zone: TimeZone) -> Date.VerbatimFormatStyle {
        Date.VerbatimFormatStyle(
            format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)",
            locale: locale, timeZone: zone, calendar: Calendar(identifier: .gregorian))
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

    /// The fuel in the tanks as FPL's gauge writes it, whole gallons
    /// rounded down, so never more in them than there are; past empty the
    /// gallons short in words, "12 gal short" (the engine's fuel_in_tanks
    /// below nought), rounded the same way down, never fewer short. It was
    /// "−12 gal", which read as a figure gone wrong at a destination a leg
    /// could not reach (the owner's iPhone, 2026-11-23, as the web's
    /// gaugeWords).
    static func tankGallons(_ gal: Double) -> String {
        let whole = Int(gal.rounded(.down))
        return whole < 0 ? "\(-whole) gal short" : "\(whole) gal"
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

nonisolated extension String {
    /// Padded with zeros on the left to a width, "7" to "007".
    func leftPadded(to width: Int) -> String {
        count >= width ? self : String(repeating: "0", count: width - count) + self
    }
}
