import Foundation

/// Each field's weather mark put together from what the planner sent and
/// what the engine says of it, through wt_call: the arrow and its red
/// (wind_arrow, on the field's least crosswind, least_crosswind, which the
/// planner works out with the same engine for each field in view), the
/// barb (wind_barb), calm (wind_calm), and the ↓ (weather_worse, a route
/// field's METAR now against its TAF for the flight's time there). The
/// words are the report's figures as the app writes them; no figure is
/// worked out here.
enum FieldWeatherMarks {
    /// A field's report as the mark takes it: the planner's in-view answer
    /// for the field (FieldWeatherFeed), its METAR's figures as read.
    struct Report: Equatable, Sendable {
        var ident: String
        var category: String?
        var windDirTrueDeg: Double?
        var windSpeedKt: Double?
        var windGustKt: Double?
        /// The least crosswind its runways leave (the engine's least_crosswind).
        var crosswindKt: Double?
        var visibilityLine: String?
        var ceilingLine: String?
    }

    /// A field's report from the planner's in-view answer: its category
    /// (the engine's flight_category, AIM 7-1-7, worked by the planner) and
    /// its METAR's parts as the planner sent them (PinWeather).
    static func report(_ pin: AirportPin) -> Report {
        let w = pin.weather
        return Report(ident: pin.ident, category: pin.flightCategory, windDirTrueDeg: w?.windDirTrueDeg, windSpeedKt: w?.windSpeedKt,
                      windGustKt: w?.windGustKt, crosswindKt: w?.crosswindKt,
                      visibilityLine: visibilityLine(w?.visibilitySm, wx: w?.wx),
                      ceilingLine: ceilingLine(w?.ceilingFt, unknown: w?.ceilingUnknown == true, cover: w?.ceilingCover))
    }

    /// The station model's first line as a METAR writes it: "2 SM BR",
    /// the visibility in statute miles with the weather as reported.
    static func visibilityLine(_ sm: Double?, wx: String?) -> String? {
        let visibility = sm.map { "\(Self.number($0)) SM" }
        let line = [visibility, wx].compactMap { $0 }.joined(separator: " ")
        return line.isEmpty ? nil : line
    }

    /// The second: the ceiling as a METAR codes its layer, the cover the
    /// planner sends (`ceiling_cover`: BKN, OVC or VV, the layers that make
    /// a ceiling, 14 CFR 1.1) and its height in hundreds of feet above the
    /// field ("OVC 008" for 800 ft, AC 00-45H), or "CIG 008" where no cover
    /// came, as Android writes it (StationLines); "OVC ///" or "CIG ///"
    /// where the report sent a ceiling with no height; none with no ceiling.
    static func ceilingLine(_ ft: Double?, unknown: Bool, cover: String? = nil) -> String? {
        let code = cover?.trimmingCharacters(in: .whitespaces).uppercased()
        let word = code.flatMap { ceilingCovers.contains($0) ? $0 : nil } ?? "CIG"
        if unknown { return word + " ///" }
        guard let ft else { return nil }
        return word + " " + String(format: "%03d", Int((ft / 100).rounded()))
    }

    /// The covers that make a ceiling (14 CFR 1.1: broken, overcast, or an
    /// obscuration's vertical visibility).
    private static let ceilingCovers: Set<String> = ["BKN", "OVC", "VV"]

    /// A figure with no trailing zeros: 2, 1.5, 0.25.
    private static func number(_ x: Double) -> String {
        x == x.rounded() ? String(Int(x)) : String(format: "%g", x)
    }

    /// The mark for `report`: `demonstratedKt` the picked airplane's
    /// maximum demonstrated crosswind, nil with none picked or no figure
    /// (never red then); `worse` whether the ↓ shows.
    static func mark(_ report: Report, demonstratedKt: Double?, worse: Bool) -> FieldWeatherMark {
        let speed = report.windSpeedKt
        let calm = (try? Engine.windCalm(speedKt: speed)) ?? false
        let arrow = try? Engine.windArrow(speedKt: speed, gustKt: report.windGustKt, crosswindKt: report.crosswindKt, demonstratedKt: demonstratedKt)
        let barb = speed.flatMap { try? Engine.windBarb(speedKt: $0) }
        return FieldWeatherMark(
            category: report.category,
            windFromDeg: report.windDirTrueDeg, windKt: speed, gustKt: report.windGustKt, calm: calm,
            feathers: barb.map { Feathers(flags: $0.flags, barbs: $0.barbs, halfBarbs: $0.halfBarbs) },
            arrow: arrow?.shown == true && report.windDirTrueDeg != nil, arrowRed: arrow?.over == true,
            windLabel: windLabel(dirTrueDeg: report.windDirTrueDeg, speedKt: speed, gustKt: report.windGustKt),
            visibilityLine: report.visibilityLine, ceilingLine: report.ceilingLine, worse: worse,
            spoken: spoken(report, calm: calm, red: arrow?.over == true, worse: worse))
    }

    /// The arrow's words as a METAR has them, tens of degrees and knots:
    /// "18G26" for 18 gusting 26, "12" steady.
    static func windLabel(dirTrueDeg: Double?, speedKt: Double?, gustKt: Double?) -> String? {
        guard let speedKt else { return nil }
        let steady = Int(speedKt.rounded())
        guard let gustKt, gustKt > speedKt else { return "\(steady)" }
        return "\(steady)G\(Int(gustKt.rounded()))"
    }

    /// What VoiceOver says after the ident: "IFR, wind 220 at 18 gusting
    /// 26", with the crosswind and the ↓ said where they show.
    static func spoken(_ report: Report, calm: Bool, red: Bool, worse: Bool) -> String {
        var parts = [SpokenFigures.flightCategory(report.category)]
        if calm {
            parts.append("wind calm")
        } else if let speed = report.windSpeedKt {
            let from = report.windDirTrueDeg.map { String(format: "%03d", Int($0.rounded())) } ?? "variable"
            let gust = report.windGustKt.flatMap { $0 > speed ? " gusting \(Int($0.rounded()))" : nil } ?? ""
            parts.append("wind \(from) at \(Int(speed.rounded()))\(gust)")
        }
        if red { parts.append("more crosswind than the airplane was shown to handle") }
        if worse { parts.append("forecast worse by arrival") }
        return parts.joined(separator: ", ")
    }

    // MARK: Getting worse by arrival

    /// The route's fields whose TAF for the flight's time there is worse
    /// than their METAR now, and worse than VFR (the engine's weather_worse,
    /// AIM 7-1-7): each field's METAR as the reading before, its TAF at
    /// the plan's ETA (the planner's forecast station, `eta_*`) as the one
    /// after. A field with no METAR or no TAF placed on the route has none.
    @MainActor
    static func worse(_ briefing: Briefing?, fields: Set<String>) -> Set<String> {
        guard let briefing, !fields.isEmpty else { return [] }
        var now: [EngineContract.WorseField] = []
        var atEta: [EngineContract.WorseField] = []
        for station in briefing.forecast.stations where fields.contains(station.icaoId) && station.eta != nil {
            guard let metar = briefing.metars[station.icaoId] ?? nil else { continue }
            now.append(.init(ident: station.icaoId, ceilingFt: metar.ceilingFt, visibilitySm: metar.visibilitySm,
                             ceilingUnknown: metar.ceilingUnknown, arrival: true))
            atEta.append(.init(ident: station.icaoId, ceilingFt: station.etaCeilingFt, visibilitySm: station.etaVisibilitySm,
                               ceilingUnknown: station.etaCeilingUnknown, arrival: true))
        }
        return worse(now: now, atEta: atEta)
    }

    /// The last readings asked and their answer: the map asks on every
    /// render, the engine only when the readings change.
    @MainActor private static var lastWorse: (now: [EngineContract.WorseField], atEta: [EngineContract.WorseField], answer: Set<String>)?

    /// The same from the readings in hand (the shared fixtures' shape).
    @MainActor
    static func worse(now: [EngineContract.WorseField], atEta: [EngineContract.WorseField]) -> Set<String> {
        guard !atEta.isEmpty else { return [] }
        if let last = lastWorse, last.now == now, last.atEta == atEta { return last.answer }
        let answer = try? Engine.weatherWorse(then: .init(metars: nil, advisories: nil, tafs: now),
                                              now: .init(metars: nil, advisories: nil, tafs: atEta))
        let worse = Set((answer?.worse ?? []).filter { $0.kind == "taf" }.compactMap(\.ident))
        lastWorse = (now, atEta, worse)
        return worse
    }

    // MARK: The airplane

    /// The picked airplane's maximum demonstrated crosswind, its type's
    /// book's (the POH's, data/aircraft's `crosswind.demonstrated_kt`): nil
    /// with no airplane picked, an own airplane of no stock type, or a
    /// book with no figure, so the arrow is never red on an assumption
    /// (the owner, 2026-11-09).
    @MainActor
    static func demonstratedKt(_ plan: Plan, airplanes: Airplanes = .shared) -> Double? {
        guard plan.airplaneChosen, case .object(let crosswind)? = airplanes.books[plan.aircraft]?["crosswind"],
              case .number(let kt)? = crosswind["demonstrated_kt"] else { return nil }
        return kt
    }
}
