import Foundation

/// Each field's weather mark put together from what the planner sent and
/// what the engine says of it, through wt_call: the barb (wind_barb, calm
/// among its answers), whether it is drawn zoomed out and red (wind_arrow,
/// on the field's least crosswind, least_crosswind, which the planner
/// works out with the same engine for each field in view), and the ↓
/// (weather_worse, a route field's METAR now against its TAF for the
/// flight's time there). The words are the report's figures as the app
/// writes them; no figure is worked out here.
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

    /// How long a field's report stands before its mark is greyed and
    /// says its age: an hour, as a routine METAR is made each hour (AC
    /// 00-45H, chapter 3, routine surface observations); a report heard
    /// longer ago than that, with no signal to hear the next, is likely
    /// not the field's weather now.
    static let staleAfterS: TimeInterval = 60 * 60

    /// The age said by a stale mark, "1h 15m"; nil while the report is
    /// within staleAfterS of `now`.
    static func heardAgo(_ heardAt: Date?, now: Date = Date()) -> String? {
        guard let heardAt, now.timeIntervalSince(heardAt) > staleAfterS else { return nil }
        return Format.duration(now.timeIntervalSince(heardAt) / 60)
    }

    /// A mark made stale: its age on it and said, its halo greyed where
    /// it is drawn (AirportMarkView).
    static func aged(_ mark: FieldWeatherMark, heardAt: Date?, now: Date = Date()) -> FieldWeatherMark {
        guard let ago = heardAgo(heardAt, now: now) else { return mark }
        var out = mark
        out.heardAgo = ago
        out.spoken += ", weather heard \(ago) ago, no newer report"
        return out
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
    /// field ("OVC 008" for 800 ft, FAA-H-8083-28B 24.4.3.9), or "CIG 008" where no cover
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
    /// (never red then); `worse` whether the ↓ shows. Calm is the barb's
    /// own answer (wind_barb: under 3 kt, as the NWS's barb table rounds
    /// 0-2 kt to calm), so a 1 or 2 kt wind is a ring, not a bare staff.
    /// Where the engine cannot read the wind (logged by Engine.rule) no
    /// barb is drawn that it might not be, and VoiceOver says the wind
    /// couldn't be worked out.
    static func mark(_ report: Report, demonstratedKt: Double?, worse: Bool) -> FieldWeatherMark {
        let speed = report.windSpeedKt
        let arrow = try? Engine.windArrow(speedKt: speed, gustKt: report.windGustKt, crosswindKt: report.crosswindKt, demonstratedKt: demonstratedKt)
        let barb = speed.flatMap { kt in try? Engine.windBarb(speedKt: kt) }
        let unknown = speed != nil && (arrow == nil || barb == nil)
        let calm = barb?.calm == true
        return FieldWeatherMark(
            category: report.category,
            windFromDeg: report.windDirTrueDeg, windKt: speed, gustKt: report.windGustKt, calm: calm,
            feathers: barb.map { Feathers(flags: $0.flags, barbs: $0.barbs, halfBarbs: $0.halfBarbs) },
            far: arrow?.shown == true && barb != nil, over: arrow?.over == true,
            variable: barb != nil && !calm && report.windDirTrueDeg == nil ? variableLabel(speed) : nil,
            visibilityLine: report.visibilityLine, ceilingLine: report.ceilingLine, worse: worse,
            spoken: spoken(report, calm: calm, red: arrow?.over == true, worse: worse, windUnknown: unknown))
    }

    /// A variable wind, which no barb can point, as the METAR writes it:
    /// "VRB05". Its gust is left to the field's card, as the barb's is.
    static func variableLabel(_ speedKt: Double?) -> String? {
        speedKt.map { String(format: "VRB%02d", Int($0.rounded())) }
    }

    /// What VoiceOver says after the ident: "IFR, wind 220 at 18 gusting
    /// 26", with the crosswind and the ↓ said where they show.
    static func spoken(_ report: Report, calm: Bool, red: Bool, worse: Bool, windUnknown: Bool = false) -> String {
        var parts = [SpokenFigures.flightCategory(report.category)]
        if windUnknown {
            parts.append("wind couldn't be worked out from the report")
        } else if calm {
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
        let worse: Set<String>
        do {
            let answer = try Engine.weatherWorse(then: .init(metars: nil, advisories: nil, tafs: now),
                                                 now: .init(metars: nil, advisories: nil, tafs: atEta))
            worse = Set(answer.worse.filter { $0.kind == "taf" }.compactMap(\.ident))
        } catch {
            // The map has no line to say it on: no ↓ is drawn, the failure
            // is logged, and the Brief's forecasts are there in full.
            Log.app.error("weather_worse refused the map's fields: \(error.localizedDescription, privacy: .public)")
            worse = []
        }
        lastWorse = (now, atEta, worse)
        return worse
    }

    /// The alternates whose forecast at the ETA there is worse than their
    /// METAR now (AlternateCheck.atEta), each METAR the map's own report of
    /// the field (FieldWeatherFeed): the same rule as the route's fields,
    /// asked only for the alternates in view with a report.
    @MainActor
    static func worse(alternates atEta: [EngineContract.WorseField], reports: [String: AirportPin]) -> Set<String> {
        let shown = atEta.filter { reports[$0.ident]?.weather != nil }
        let now: [EngineContract.WorseField] = shown.compactMap { field in
            guard let w = reports[field.ident]?.weather else { return nil }
            return .init(ident: field.ident, ceilingFt: w.ceilingFt, visibilitySm: w.visibilitySm, ceilingUnknown: w.ceilingUnknown, arrival: true)
        }
        return worse(now: now, atEta: shown)
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
