import Foundation

/// How an airport's card and the airspace card write what the planner
/// sends, in the web app's words (lib/frequencies, lib/advisories,
/// lib/airspace, lib/stopServices, features/plan/format): no figure is
/// worked out here, only written. The FAA's wording and the runway rules
/// are the shared engine's (crate::wording, crate::runway), one copy with
/// the web app; the formatting is the app's.
enum AirportWords {
    /// A figure as sent, without a ".0" it does not have: 3 and 1.5.
    static func plain(_ x: Double) -> String {
        x == x.rounded() && abs(x) < 1e9 ? String(Int(x)) : String(x)
    }

    /// A bearing as one of the eight compass points in words,
    /// "northeast": the engine's `compass_word`, the web's and Android's.
    /// Words only: where the engine refuses (logged by Engine.rule) the
    /// bearing itself is said, "045°", which is no less true.
    static func compassWord(_ deg: Double) -> String {
        (try? Engine.compassWord(bearingDeg: deg)) ?? Format.heading(deg)
    }

    /// The eight points of the compass, for "12 nm NE": the engine's
    /// point, written short.
    static func compassPoint(_ deg: Double) -> String {
        let short = ["north": "N", "northeast": "NE", "east": "E", "southeast": "SE",
                     "south": "S", "southwest": "SW", "west": "W", "northwest": "NW"]
        let word = compassWord(deg)
        return short[word] ?? word
    }

    /// Whether a wind is calm, a speed of 0 (AIM 7-1-28): the engine's
    /// `wind_calm`; no speed is not calm. Words only: where the engine
    /// refuses (logged by Engine.rule) the wind is not called calm, and
    /// its speed is said as reported.
    static func calm(_ speedKt: Double?) -> Bool {
        (try? Engine.windCalm(speedKt: speedKt)) == true
    }

    /// "N42°19.0′ W088°05.4′": tenths of a minute first, so 59.96
    /// minutes never prints as 60.0.
    static func degreesMinutes(lat: Double, lon: Double) -> String {
        func part(_ value: Double, _ positive: String, _ negative: String, _ width: Int) -> String {
            let tenths = Int((abs(value) * 600).rounded())
            let whole = tenths / 600
            let minutes = Double(tenths - whole * 600) / 10
            let degrees = String(whole).leftPadded(to: width)
            return "\(value >= 0 ? positive : negative)\(degrees)°\(String(format: "%04.1f", minutes))′"
        }
        return "\(part(lat, "N", "S", 2)) \(part(lon, "E", "W", 3))"
    }

    // MARK: The nav log's figures

    /// A point as the planner, the app's links and Maps take one,
    /// "46.84211,-92.19358": five places, about a metre.
    static func point(_ lat: Double, _ lon: Double) -> String { String(format: "%.5f,%.5f", lat, lon) }

    // MARK: Weather

    /// A report's wind: "250°T at 12 kt, gusts 18", "Calm" for 00000KT,
    /// "Variable at 4 kt" (FAA Order JO 7900.5's codes as the planner
    /// reads them), "Not reported" with no speed. Marked true, as METAR
    /// winds are (JO 7900.5), so it is never read against a runway's
    /// magnetic number (IOS-7; the web's placeWind).
    static func windLine(dirTrueDeg: Double?, speedKt: Double?, gustKt: Double?) -> String {
        guard let speedKt else { return "Not reported" }
        // A speed of nothing is calm, as 00000KT codes it (AIM 7-1-28): the
        // engine's `wind_calm`.
        if calm(speedKt) { return "Calm" }
        let from = dirTrueDeg.map { Format.heading($0) + "T" } ?? "Variable"
        let gust = gustKt.map { $0 > 0 ? ", gusts \(Int($0.rounded()))" : "" } ?? ""
        return "\(from) at \(Format.speed(speedKt))\(gust)"
    }

    /// A report's wind short, as the web's card writes it in a line:
    /// "310°T 4 kt", "VRB 4 kt", "240°T 12G20 kt", "Calm"; nil with no
    /// speed. True, as METAR winds are (FAA JO 7900.5).
    static func shortWind(dirTrueDeg: Double?, speedKt: Double?, gustKt: Double?) -> String? {
        guard let speedKt else { return nil }
        if calm(speedKt) { return "Calm" }
        let from = dirTrueDeg.map { Format.heading($0) + "T" } ?? "VRB"
        let gust = gustKt.flatMap { $0 > 0 ? "G\(Int($0.rounded()))" : nil } ?? ""
        return "\(from) \(Int(speedKt.rounded()))\(gust) kt"
    }

    /// A reported visibility: "3 sm", "1.5 sm", and "10+ sm" or "6+ sm"
    /// for a more-than report (P6SM, the AWC's "10+"; FAA JO 7900.5), as
    /// the web's miles writes it; nil with none, never a guessed figure.
    static func miles(_ sm: Double?, plus: Bool?) -> String? {
        sm.map { "\(plain($0))\(plus == true ? "+" : "") sm" }
    }

    /// The field's own report in a line under the airport card's tabs
    /// (the owner's T4, 2026-11-14), after its category chip: "Ceiling
    /// 1,800 ft · 310°T 4 kt · 1255Z". The ceiling is the planner's reading
    /// of the report (the lowest broken or overcast layer or the vertical
    /// visibility, 14 CFR 1.1), "No ceiling" with none, and left out where
    /// the report could not say (`ceiling_unknown`); the wind true, left
    /// out when not reported; the time UTC, as the report gives it. The
    /// web's weatherLineOf.
    static func weatherLine(_ metar: Metar) -> String {
        let ceiling: String? = metar.ceilingUnknown == true ? nil : metar.ceilingFt.map { "Ceiling \(Format.altitude($0))" } ?? "No ceiling"
        let wind = shortWind(dirTrueDeg: metar.windDirTrueDeg, speedKt: metar.windSpeedKt, gustKt: metar.windGustKt)
        let time = date(metar.observedAt).map(Format.zulu)
        return [ceiling, wind, time].compactMap { $0 }.joined(separator: " · ")
    }

    // Format styles rather than ISO8601DateFormatter: they are Sendable
    // values, safe to keep in a static and read from any thread.
    private static let iso = Date.ISO8601FormatStyle()
    private static let isoFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)

    /// A time as the servers and GPX files send it, with or without
    /// fractions of a second.
    static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return (try? Self.iso.parse(iso)) ?? (try? isoFraction.parse(iso))
    }

    /// When a report was made and how long ago: "1255Z · 14 min ago",
    /// the age a pilot weighs a report by.
    static func observed(_ iso: String, now: Date = Date()) -> String? {
        guard let when = date(iso) else { return nil }
        let minutes = max(0, Int((now.timeIntervalSince(when) / 60).rounded()))
        let ago = minutes < 1 ? "just now" : minutes < 90 ? "\(minutes) min ago" : "\(Int((Double(minutes) / 60).rounded())) h ago"
        return "\(Format.zulu(when)) · \(ago)"
    }

    /// Whether a METAR still counts at `now`: the engine's
    /// weather_in_force (a METAR counts for the hour after it was observed,
    /// AIM 7-1-28's "METAR-hourly"), the rule the web's Observed and the
    /// planner go by. Nil where the time cannot be read or the engine
    /// refuses (logged by Engine.rule): the report is then shown plain,
    /// its time and age still said.
    static func reportInForce(_ iso: String?, now: Date = Date()) -> Bool? {
        guard let when = date(iso) else { return nil }
        return try? Engine.weatherInForce(product: "metar", now: now.timeIntervalSince1970.rounded(.down),
                                          observed: when.timeIntervalSince1970.rounded(.down))
    }

    /// "1255Z · 3 h ago — an old report" where the report no longer counts
    /// (reportInForce), the web's words (IOS-2); as observed() otherwise.
    static func observedSaid(_ iso: String, now: Date = Date()) -> String? {
        guard let said = observed(iso, now: now) else { return nil }
        return reportInForce(iso, now: now) == false ? said + " — an old report" : said
    }

    // MARK: Runways

    /// The runway most nearly into the reported wind (AC 90-66C 11.5), the
    /// engine's gonogo_runway_in_use over each runway's wind on the end it
    /// favours: only where the wind chose it, not a calm field's most used.
    /// Nil where the engine refuses (logged by Engine.rule): no runway is
    /// then badged Best Wind, never a guessed one.
    static func bestWind(_ runways: [Runway]) -> Int? {
        let asked = runways.map { r in
            EngineContract.Runway(closed: r.closed, surface: r.surface, lengthFt: r.lengthFt.map(Double.init),
                                  runwayEnds: r.runwayEnds?.map { .init(ident: $0.ident, headingTrueDeg: $0.headingTrueDeg) },
                                  wind: r.wind.map { .init(end: $0.end, headwindKt: $0.headwindKt, crosswindKt: $0.crosswindKt,
                                                           gustCrosswindKt: $0.gustCrosswindKt, inUse: $0.inUse) })
        }
        guard !asked.isEmpty, let flown = try? Engine.gonogoRunwayInUse(runways: asked), flown.byWind else { return nil }
        return flown.runway
    }

    /// A runway's surface in words: OurAirports' "ASPH-G" is asphalt.
    static func surfaceName(_ surface: String?) -> String? {
        guard let surface, !surface.isEmpty else { return nil }
        let names = [
            "ASP": "asphalt", "ASPH": "asphalt", "CON": "concrete", "CONC": "concrete", "TURF": "turf", "GRS": "grass", "GRASS": "grass",
            "GRVL": "gravel", "GRAVEL": "gravel", "DIRT": "dirt", "WATER": "water", "SNOW": "snow", "COP": "composite", "COM": "composite",
        ]
        let code = surface.split(whereSeparator: { "-/ ".contains($0) }).first.map { String($0).uppercased() } ?? ""
        return names[code] ?? surface.lowercased()
    }

    /// The runway's number as the sectional prints it: "05" is 5 (the
    /// engine's `gonogo_runway_number`); the ident as published where the
    /// engine refuses (logged by Engine.rule), which names the same runway.
    static func runwayNumber(_ ident: String) -> String {
        (try? Engine.gonogoRunwayNumber(ident: ident)) ?? ident
    }

    /// A runway's line under its name: surface, lights, closed, and any
    /// end flown with right traffic -- every pattern turns left unless
    /// the FAA says otherwise (14 CFR 91.126(b)(1)), as the sectional's
    /// "RP 23" marks it.
    static func runwayDetail(_ runway: Runway) -> String {
        let right = (runway.runwayEnds ?? []).filter { $0.traffic == "right" }.map { runwayNumber($0.ident) }
        return [
            surfaceName(runway.surface), runway.lighted ? "lighted" : nil, runway.closed ? "closed" : nil,
            right.isEmpty ? nil : "right traffic \(right.joined(separator: ", "))",
        ].compactMap { $0 }.joined(separator: " · ")
    }

    /// The reported wind on the end it favours, as the planner worked it
    /// out (wingtip.runway_wind): "Favors 27: 10 kt headwind, 6 kt crosswind
    /// from the right, 9 in the gusts"; a calm one only for a speed of 0
    /// (the engine's `runway_calm`).
    /// Where the engine refuses (logged by Engine.rule) the wind is said in
    /// its components, never called calm.
    static func runwayWind(_ wind: RunwayWind) -> String {
        let calm = try? Engine.runwayCalm(wind: .init(end: wind.end, headwindKt: wind.headwindKt, crosswindKt: wind.crosswindKt,
                                                      gustCrosswindKt: wind.gustCrosswindKt, inUse: nil))
        if calm == true { return "Calm on \(wind.end)" }
        let along = wind.headwindKt >= 0 ? "\(plain(wind.headwindKt)) kt headwind" : "\(plain(-wind.headwindKt)) kt tailwind"
        let kt = abs(wind.crosswindKt)
        let gust = wind.gustCrosswindKt.map(abs)
        let side = wind.crosswindKt > 0 ? " from the right" : wind.crosswindKt < 0 ? " from the left" : ""
        let gusts = gust.flatMap { $0 != kt ? ", \(plain($0)) in the gusts" : nil } ?? ""
        return "Favors \(wind.end): \(along), \(plain(kt)) kt crosswind\(side)\(gusts)"
    }

    // MARK: Radio

    enum FrequencyKind: String, Decodable { case tower, ground, weather, approach, traffic, other }

    /// A frequency named in words (TWR is "Tower"), its kind for the
    /// row's glyph, and what OurAirports says of it in sentence case where
    /// that adds to the name ("Minneapolis APP/DEP"): the engine's
    /// `frequency_line`. The type as it came where the engine cannot
    /// answer (logged by Engine.rule): the frequency's own code is still true.
    static func frequencyLine(type: String?, description: String?) -> (name: String, kind: FrequencyKind, detail: String?) {
        guard let line = try? Engine.frequencyLine(type: type, description: description) else { return (type ?? "Frequency", .other, nil) }
        return (line.name, FrequencyKind(rawValue: line.kind) ?? .other, line.detail)
    }

    /// The indices of a field's frequencies in the order a pilot dials
    /// them -- the weather (ATIS, AWOS), clearance, ground, the tower or
    /// CTAF, approach and departure, then the rest (AIM 4-1-13, 4-1-11) --
    /// the engine's `frequencies_in_order`. The file's own order where the
    /// engine refuses (logged by Engine.rule): every frequency still shown.
    static func frequencyOrder(_ frequencies: [Frequency]) -> [Int] {
        let asked = frequencies.map { EngineContract.FieldFrequency(type: $0.type, description: $0.description, frequencyMhz: $0.frequencyMhz) }
        guard let order = try? Engine.frequenciesInOrder(frequencies: asked),
              order.count == frequencies.count, Set(order) == Set(frequencies.indices) else { return Array(frequencies.indices) }
        return order
    }

    /// A frequency as pilots write it: 120.7, 122.95, 124.475.
    static func mhz(_ value: Double) -> String {
        var text = String(format: "%.3f", value)
        for _ in 0..<2 where text.hasSuffix("0") { text.removeLast() }
        return text
    }

    // MARK: The FAA's words

    /// The FAA's capitalised text in sentence case, its codes kept:
    /// "INTERMITTENT BY NOTAM 4 HOURS IN ADVANCE" reads "Intermittent by
    /// NOTAM 4 hours in advance"; a class as the AIM writes it, "Class B"
    /// (AIM 3-2-1). Text with any lower case is someone's own writing and
    /// is left as it is; raw reports never come here. The engine's
    /// `faa_words`; the text as it came where the engine cannot answer
    /// (logged by Engine.rule): the FAA's own words, in capitals.
    static func faaWords(_ text: String?) -> String {
        guard let text, !text.isEmpty else { return "" }
        if let words = (try? Engine.faaWords(text: text))?.value as? String { return words }
        return text
    }

    // MARK: Airspace

    /// "CHICAGO, DUPAGE AIRPORT CLASS D" as "Chicago, Dupage Airport":
    /// the engine's `short_airspace_name`.
    /// The name as the FAA has it where the engine refuses (logged).
    static func shortAirspaceName(_ name: String) -> String {
        (try? Engine.shortAirspaceName(name: name)) ?? name
    }

    /// 91.155's minimums in a line, as the planner gives them: "3 sm, 500
    /// below, 1,000 above, 2,000 horizontal", or "1 sm, clear of clouds".
    static func minimumsLine(_ m: VfrMinimums) -> String {
        if m.clearOfClouds { return "\(plain(m.visibilitySm)) sm, clear of clouds" }
        func ft(_ x: Double?) -> String { x.map(Format.grouped) ?? Format.none }
        let horizontal = m.horizontalFt == Units.ftPerSm ? "1 sm" : ft(m.horizontalFt)
        return "\(plain(m.visibilitySm)) sm, \(ft(m.belowFt)) below, \(ft(m.aboveFt)) above, \(horizontal) horizontal"
    }

    /// A band's floor and ceiling: "Surface" where the floor is at or
    /// under the ground there, FL600 for the top of Class A (14 CFR 71.33).
    static func bandRange(_ band: AirspaceBand, ground: Double?) -> String {
        let bottom = ground.map { band.floorFt <= $0 } == true ? "Surface" : Format.altitude(band.floorFt)
        let top = band.ceilingFt >= 60000 ? "FL600" : "\(Format.altitude(band.ceilingFt)) MSL"
        return "\(bottom) to \(top)"
    }

    /// A special-use area's floor and ceiling as the FAA's file gives
    /// them: SFC, a flight level (STD, 14 CFR 1.1), feet AGL or MSL --
    /// "Surface to 18,000 ft", or "the surface" in a sentence's middle.
    /// The engine's `sua_altitudes`.
    /// Where the engine refuses (logged by Engine.rule), the file's own
    /// figures and references, "0 SFC to 18000 MSL".
    static func suaAltitudes(_ area: SpecialUse, midSentence: Bool = false) -> String {
        if let words = try? Engine.suaAltitudes(floorFt: area.floorFt, floorRef: area.floorRef, ceilingFt: area.ceilingFt,
                                                ceilingRef: area.ceilingRef, midSentence: midSentence) { return words }
        func raw(_ ft: Double?, _ ref: String?) -> String { [ft.map { Format.grouped($0) }, ref].compactMap { $0 }.joined(separator: " ") }
        return "\(raw(area.floorFt, area.floorRef)) to \(raw(area.ceilingFt, area.ceilingRef))"
    }

    // MARK: Services

    /// NASR's fuel codes as the pump is labelled: the jet fuels by name,
    /// the rest (100LL, UL94, MOGAS) as the codes they are (the engine's
    /// `fuel_names`).
    /// Where the engine refuses, its problem in their place, so a code is
    /// never passed off as the fuel's name.
    static func fuelNames(_ types: [String]) -> String {
        do { return try Engine.fuelNames(types: types) } catch { return "the fuels couldn't be worked out: \(error.localizedDescription)" }
    }

    /// How far a place is from the field: the minutes' walk where it is a
    /// walk, else statute miles.
    static func away(_ place: NearbyPlace) -> String {
        if let walk = place.walkMin { return "\(walk) min walk" }
        let miles = Measurement(value: Double(place.distanceM), unit: UnitLength.meters).converted(to: .miles)
        return "\(Format.number(miles.value, decimals: 1)) mi"
    }
}
