import CoreLocation
import Foundation

/// How the airplane cards write things, as the web app's pastFlightFormat
/// and FlightCard do.
enum FlightWords {
    /// What a name's case is asked as (the engine's `name_case` kinds).
    enum NameKind: String {
        /// A maker's or a model's: "CESSNA 172S" as "Cessna 172S", its
        /// initials kept (IAE, CFM).
        case maker
        /// A registrant's or an operator's: "UNITED AIRLINES INC" as
        /// "United Airlines Inc".
        case person
    }

    /// A name in the FAA's or a registry's capitals as a name is written,
    /// the engine's `name_case`, as the web writes it; as sent where the
    /// engine cannot say (the raw text stays as sent).
    static func nameCase(_ text: String, _ kind: NameKind = .person) -> String {
        let cased: String? = try? Engine.rule("name_case", EngineContract.NameCaseInput(text: text, kind: kind.rawValue))
        return cased ?? text
    }

    /// How long, as every duration is written (Format.duration): "2h 13m", "41m".
    static func lasted(_ seconds: Double) -> String {
        Format.duration(seconds / 60)
    }

    /// A field's town as FlightAware writes it under the ident: "Skyhaven,
    /// NH" in the US, the town alone abroad, its name where its town is
    /// not known.
    static func place(_ field: PastFlightField?) -> String? {
        guard let field else { return nil }
        let state = field.region.flatMap { $0.hasPrefix("US-") ? String($0.dropFirst(3)) : nil }
        if let city = field.city { return state.map { "\(city), \($0)" } ?? city }
        return field.name
    }

    /// "15:10 today", "09:42 yesterday", "18:05 Sat 11 Oct", in this
    /// device's clock.
    static func when(_ seconds: Double, now: Date = Date()) -> String {
        let at = Date(timeIntervalSince1970: seconds)
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: at), to: calendar.startOfDay(for: now)).day ?? 0
        let time = at.formatted(date: .omitted, time: .shortened)
        switch days {
        case 0: return "\(time) today"
        case 1: return "\(time) yesterday"
        default: return "\(time) \(at.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))"
        }
    }

    /// How a flight ended and how long it flew: "Landed · 52 min".
    static func ended(_ flight: PastFlightSummary) -> String {
        "\(flight.inAir ? "In the air" : flight.local ? "Local flight" : flight.landed ? "Landed" : "Last heard") · \(lasted(flight.on - flight.off))"
    }

    /// A transponder code said in words, where it says more than a code:
    /// 7500 unlawful interference (AIM 6-3-4), 7600 two-way radio failure
    /// (AIM 6-4-2), 7700 an emergency (AIM 6-2-2) -- the engine's
    /// `squawk_meaning`, the web's and Android's.
    static func squawk(_ code: String?) -> String? {
        // Words beside the code, which is shown as sent either way. Where
        // the engine refuses (logged by Engine.rule) that is said, never read
        // as an ordinary code: 7700 must not pass unmarked.
        do { return try Engine.squawkMeaning(squawk: code) } catch { return "its meaning could not be worked out" }
    }

    /// Feet against own ship's: "500 ft above", "1,200 ft below", "level".
    static func against(_ feet: Double) -> String {
        let rounded = Int((feet / 100).rounded()) * 100
        if rounded == 0 { return "level" }
        return "\(Format.altitude(Double(abs(rounded)))) \(rounded > 0 ? "above" : "below")"
    }

    /// How far and which way another airplane is from own ship, and how
    /// high against it: "12 nm NE of you, 500 ft above", the engine's
    /// `distance_nm` and `bearing_deg`; thrown where it cannot say. From
    /// own ship's place and height as a card reads them (OwnShip's
    /// coarseCoordinate and markedFt), not each fix.
    static func fromYou(_ at: CLLocationCoordinate2D, ownFt: Double?, lat: Double, lon: Double, altitudeFt: Double?) throws -> String {
        let plane = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        let nm = try Flight.distanceNm(at, plane)
        let bearing = try Engine.bearingDeg(lat1: at.latitude, lon1: at.longitude, lat2: lat, lon2: lon)
        return "\(Format.distance(nm, decimals: 0)) \(AirportWords.compassPoint(bearing)) of you"
            + (ownFt.flatMap { own in altitudeFt.map { ", " + against($0 - own) } } ?? "")
    }
}
