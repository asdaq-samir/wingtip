import UIKit

/// The model weather's fields, in the web's menu order (the owner's pick,
/// 2026-11-12: the wind and what it carries, the sky, the air, then the
/// Aviation Weather Center's hazards aloft). The raw value is the field's
/// picture's name (the planner's /api/weather/flow).
enum FlowFieldKind: String, CaseIterable, Identifiable, Sendable {
    case off, wind, gust, precip, cloud, ceiling, cape, temp, vis, icing, turb, frzlvl, tops

    var id: String { rawValue }

    /// The menu's and the legend's name, the web's NAMES.
    var label: String {
        switch self {
        case .off: "Off"
        case .wind: "Wind"
        case .gust: "Gusts"
        case .precip: "Precipitation"
        case .cloud: "Clouds"
        case .ceiling: "Ceiling"
        case .cape: "Thunderstorm energy"
        case .temp: "Temperature"
        case .vis: "Visibility"
        case .icing: "Icing"
        case .turb: "Turbulence"
        case .frzlvl: "Freezing level"
        case .tops: "Cloud tops"
        }
    }
}

/// One field as the map draws it and the legend explains it: the web's
/// FieldLook (features/weather-flow/flowLook.ts and aviationLooks.ts).
struct FieldLook: Sendable {
    var title: String
    var ramp: FlowRamp
    /// The legend's bar where it is not the ramp: a banded field's bands
    /// as equal blocks, so a narrow band reads as well as a wide one.
    var bar: FlowRamp
    var ticks: [(at: Double, label: String)]
    /// How strongly the field covers the chart, 0 to 1.
    var opacity: CGFloat
}

/// The fields' looks, built from the engine's bands (model_weather_bands,
/// aviation_grid_bands): the precipitation's intensity words by
/// reflectivity (AIM 7-1-12), the ceiling's by AIM 7-1-7's categories,
/// CAPE's by the NWS's, AWC's icing categories and turbulence EDR
/// thresholds. The colours, their strengths and how strongly each covers
/// the chart are the map's own, design/tokens.json's flow group
/// (WingtipFlow), which the web's flowLook and aviationLooks read too.
enum FlowLooks {
    private typealias W = WingtipColor.Weather
    private typealias T = WingtipFlow
    /// AWC's "Light (< 15,500 lbs)" turbulence row (aviationweather.gov GFA
    /// help), the airplanes the app plans for; the legend says so.
    static let turbulenceClass = "light"

    @MainActor private static var built: [FlowFieldKind: FieldLook]?

    /// A field's look, built once from the engine's answers; nil where the
    /// engine refused (the field is then not drawn, and the legend says so).
    @MainActor
    static func look(_ field: FlowFieldKind) -> FieldLook? {
        if built == nil, let bands = try? Engine.modelWeatherBands(), let grid = try? Engine.aviationGridBands() {
            built = looks(bands, grid)
        }
        return built?[field]
    }

    private static func s(_ at: Double, _ colour: UIColor, _ alpha: UInt8) -> FlowRamp.Stop { FlowRamp.stop(at, colour, alpha) }
    /// A token's ramp as the ramp's stops.
    private static func tokenStops(_ ramp: [WingtipFlow.Stop]) -> [FlowRamp.Stop] { ramp.map { s($0.at, $0.colour, $0.alpha) } }
    private static func plain(_ title: String, _ stops: [FlowRamp.Stop], _ ticks: [Double], _ opacity: CGFloat, label: (Double) -> String = { String(Int($0)) }) -> FieldLook {
        FieldLook(title: title, ramp: FlowRamp(stops: stops), bar: FlowRamp(stops: stops), ticks: ticks.map { ($0, label($0)) }, opacity: opacity)
    }

    /// A banded field's legend: each band an equal block of its colour, its
    /// word at the block's middle.
    private static func blocks(_ words: [String], _ colours: [UIColor]) -> (FlowRamp, [(at: Double, label: String)]) {
        let stops = words.indices.flatMap { i in [s(Double(i), colours[i], T.alphaBlock), s(Double(i) + 0.999, colours[i], T.alphaBlock)] }
        return (FlowRamp(stops: stops), words.indices.map { (Double($0) + 0.5, words[$0]) })
    }

    /// Banded steps, each its colour from its least value to the next's,
    /// clear under the first, as AWC's own maps draw them.
    private static func steps(_ froms: [Double], _ colours: [UIColor], _ alpha: UInt8, top: Double) -> FlowRamp {
        var out = [s((froms.first ?? 0) - 1e-3, colours[0], 0)]
        for (i, from) in froms.enumerated() {
            let next = i + 1 < froms.count ? froms[i + 1] : top
            out += [s(from, colours[i], alpha), s(next - 1e-3, colours[i], alpha)]
        }
        return FlowRamp(stops: out)
    }

    static func looks(_ bands: EngineContract.ModelWeatherBandsAnswer, _ grid: EngineContract.AviationGridBandsAnswer) -> [FlowFieldKind: FieldLook] {
        var out: [FlowFieldKind: FieldLook] = [:]
        let windStops = tokenStops(T.rampWind)
        out[.wind] = plain("Wind (kt)", windStops, T.scaleWindTicks, T.coverTint)
        out[.gust] = plain("Gusts (kt)", windStops, T.scaleWindTicks, T.coverTint)

        // Precipitation as the reflectivity a radar would see for its rate
        // (the engine's precip_dbz), clear under the engine's least.
        let p = bands.precip.bands.map(\.from)
        let a = T.alphaRain
        if p.count == 4, a.count == 6 {
            let least = bands.precip.leastDbz, top = p[3] + T.scaleRainHeadroom
            let rain = [s(least - 0.1, W.flowRainLight, a[0]), s(least, W.flowRainLight, a[1]), s(p[1], W.flowRainModerate, a[2]),
                        s(p[2], W.flowRainHeavy, a[3]), s(p[3], W.flowRainExtreme, a[4]), s(top, W.flowRainExtremeTop, a[5])]
            let edges = p + [top]
            let ticks = bands.precip.bands.enumerated().map { i, b in ((edges[i] + edges[i + 1]) / 2, b.word) }
            out[.precip] = FieldLook(title: "Precipitation", ramp: FlowRamp(stops: rain), bar: FlowRamp(stops: rain), ticks: ticks, opacity: T.coverSolid)
        }

        // The ceiling in the airport marks' category colours, hard-edged at
        // the bands, fading to clear over twice VFR's floor.
        let ceilingColours = [W.flowCeilingLifr, W.flowCeilingIfr, W.flowCeilingMvfr, W.flowCeilingVfr]
        let ceilingAlpha = T.alphaCeiling
        if bands.ceiling.count == 4, ceilingAlpha.count == 4, let vfr = bands.ceiling.last?.from {
            var stops: [FlowRamp.Stop] = []
            for (i, b) in bands.ceiling.enumerated() {
                stops.append(s(b.from, ceilingColours[i], ceilingAlpha[i]))
                stops.append(i + 1 < bands.ceiling.count ? s(bands.ceiling[i + 1].from - 1, ceilingColours[i], ceilingAlpha[i]) : s(vfr * 2, ceilingColours[i], 0))
            }
            let (bar, _) = blocks(bands.ceiling.map(\.word), ceilingColours)
            let ticks = bands.ceiling.enumerated().map { i, b in (Double(i) + 0.5, b.from > 0 ? "\(b.word) \(Format.grouped(b.from))" : b.word) }
            out[.ceiling] = FieldLook(title: "Ceiling (ft above ground)", ramp: FlowRamp(stops: stops), bar: bar, ticks: ticks, opacity: T.coverWash)
        }

        // CAPE yellow to magenta, clear at none.
        let capeColours = [W.flowCapeWeak, W.flowCapeModerate, W.flowCapeStrong, W.flowCapeExtreme]
        let ca = T.alphaCape
        if bands.cape.count == 4, ca.count == 5 {
            let c = bands.cape.map(\.from)
            let ramp = [s(0, W.flowCapeWeak, ca[0]), s(c[1] / 2, W.flowCapeWeak, ca[1]), s(c[1], W.flowCapeModerate, ca[2]),
                        s(c[2], W.flowCapeStrong, ca[3]), s(c[3], W.flowCapeExtreme, ca[4])]
            let (bar, _) = blocks(bands.cape.map(\.word), capeColours)
            let ticks = bands.cape.enumerated().map { i, b in (Double(i) + 0.5, b.from > 0 ? "\(b.word) \(Format.grouped(b.from))" : b.word) }
            out[.cape] = FieldLook(title: "CAPE (J/kg)", ramp: FlowRamp(stops: ramp), bar: bar, ticks: ticks, opacity: T.coverWash)
        }

        out[.cloud] = plain("Cloud cover (%)", tokenStops(T.rampCloud), [0, 50, 100], T.coverWash)
        out[.temp] = plain("Temperature (°C)", tokenStops(T.rampTemp), [-30, -15, 0, 15, 30, 45], T.coverSolid)
        out[.vis] = plain("Visibility (SM)", tokenStops(T.rampVis), [0, 5, 10], T.coverWash)

        // AWC's icing categories 1 to 4 (0 is none, clear), a whole step each.
        let icingWords = grid.icing.filter { $0.from > 0 }
        let icingColours = [W.flowIcingTrace, W.flowIcingLight, W.flowIcingModerate, W.flowIcingHeavy]
        if icingWords.count == 4 {
            let (bar, ticks) = blocks(icingWords.map(\.word), icingColours)
            let ramp = steps(icingWords.map { $0.from - 0.5 }, icingColours, T.alphaIcing, top: icingWords[3].from + 0.5)
            out[.icing] = FieldLook(title: "Icing severity", ramp: ramp, bar: bar, ticks: ticks, opacity: T.coverHazard)
        }
        let turbRow = grid.turbulence.light
        let turbColours = [W.flowTurbLight, W.flowTurbModerate, W.flowTurbSevere, W.flowTurbExtreme]
        if turbRow.count == 4 {
            let (bar, ticks) = blocks(turbRow.map(\.word), turbColours)
            out[.turb] = FieldLook(title: "Turbulence, under 15,500 lb", ramp: steps(turbRow.map(\.from), turbColours, T.alphaTurb, top: 1), bar: bar, ticks: ticks, opacity: T.coverHazard)
        }
        let level = { (ft: Double) in ft <= 0 ? "Sfc" : Format.mapLevel(ft) }
        out[.frzlvl] = plain("Freezing level (MSL)", tokenStops(T.rampFrzlvl), [0, 4000, 8000, 12000, 16000], T.coverWash, label: level)
        out[.tops] = plain("Cloud tops (MSL)", tokenStops(T.rampTops), [10000, 20000, 30000, 40000], T.coverWash, label: level)
        return out
    }
}
