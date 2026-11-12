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
/// thresholds. The colours, their strengths and how each fades in are the
/// map's own, the tokens' (color.weather.flow-*), as the web has them.
enum FlowLooks {
    private typealias W = WingtipColor.Weather
    private static let tint: CGFloat = 0.6, wash: CGFloat = 0.75, solid: CGFloat = 0.9
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
    private static func plain(_ title: String, _ stops: [FlowRamp.Stop], _ ticks: [Double], _ opacity: CGFloat, label: (Double) -> String = { String(Int($0)) }) -> FieldLook {
        FieldLook(title: title, ramp: FlowRamp(stops: stops), bar: FlowRamp(stops: stops), ticks: ticks.map { ($0, label($0)) }, opacity: opacity)
    }

    /// A banded field's legend: each band an equal block of its colour, its
    /// word at the block's middle.
    private static func blocks(_ words: [String], _ colours: [UIColor]) -> (FlowRamp, [(at: Double, label: String)]) {
        let stops = words.indices.flatMap { i in [s(Double(i), colours[i], 220), s(Double(i) + 0.999, colours[i], 220)] }
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
        let windStops = [s(0, W.flowWindCalm, 40), s(25, W.flowWindBreeze, 140), s(50, W.flowWindStrong, 190), s(75, W.flowWindGale, 220)]
        out[.wind] = plain("Wind (kt)", windStops, [0, 25, 50, 75], tint)
        out[.gust] = plain("Gusts (kt)", windStops, [0, 25, 50, 75], tint)

        // Precipitation as the reflectivity a radar would see for its rate
        // (the engine's precip_dbz), clear under the engine's least.
        let p = bands.precip.bands.map(\.from)
        if p.count == 4 {
            let least = bands.precip.leastDbz, top = p[3] + 15
            let rain = [s(least - 0.1, W.flowRainLight, 0), s(least, W.flowRainLight, 160), s(p[1], W.flowRainModerate, 190),
                        s(p[2], W.flowRainHeavy, 215), s(p[3], W.flowRainExtreme, 235), s(top, W.flowRainExtremeTop, 245)]
            let edges = p + [top]
            let ticks = bands.precip.bands.enumerated().map { i, b in ((edges[i] + edges[i + 1]) / 2, b.word) }
            out[.precip] = FieldLook(title: "Precipitation", ramp: FlowRamp(stops: rain), bar: FlowRamp(stops: rain), ticks: ticks, opacity: solid)
        }

        // The ceiling in the airport marks' category colours, hard-edged at
        // the bands, fading to clear over twice VFR's floor.
        let ceilingColours = [W.flowCeilingLifr, W.flowCeilingIfr, W.flowCeilingMvfr, W.flowCeilingVfr]
        let ceilingAlpha: [UInt8] = [220, 200, 170, 110]
        if bands.ceiling.count == 4, let vfr = bands.ceiling.last?.from {
            var stops: [FlowRamp.Stop] = []
            for (i, b) in bands.ceiling.enumerated() {
                stops.append(s(b.from, ceilingColours[i], ceilingAlpha[i]))
                stops.append(i + 1 < bands.ceiling.count ? s(bands.ceiling[i + 1].from - 1, ceilingColours[i], ceilingAlpha[i]) : s(vfr * 2, ceilingColours[i], 0))
            }
            let (bar, _) = blocks(bands.ceiling.map(\.word), ceilingColours)
            let ticks = bands.ceiling.enumerated().map { i, b in (Double(i) + 0.5, b.from > 0 ? "\(b.word) \(Format.grouped(b.from))" : b.word) }
            out[.ceiling] = FieldLook(title: "Ceiling (ft above ground)", ramp: FlowRamp(stops: stops), bar: bar, ticks: ticks, opacity: wash)
        }

        // CAPE yellow to magenta, clear at none.
        let capeColours = [W.flowCapeWeak, W.flowCapeModerate, W.flowCapeStrong, W.flowCapeExtreme]
        if bands.cape.count == 4 {
            let c = bands.cape.map(\.from)
            let ramp = [s(0, W.flowCapeWeak, 0), s(c[1] / 2, W.flowCapeWeak, 130), s(c[1], W.flowCapeModerate, 170),
                        s(c[2], W.flowCapeStrong, 200), s(c[3], W.flowCapeExtreme, 225)]
            let (bar, _) = blocks(bands.cape.map(\.word), capeColours)
            let ticks = bands.cape.enumerated().map { i, b in (Double(i) + 0.5, b.from > 0 ? "\(b.word) \(Format.grouped(b.from))" : b.word) }
            out[.cape] = FieldLook(title: "CAPE (J/kg)", ramp: FlowRamp(stops: ramp), bar: bar, ticks: ticks, opacity: wash)
        }

        out[.cloud] = plain("Cloud cover (%)", [s(0, W.flowCloud, 0), s(50, W.flowCloud, 110), s(100, W.flowCloud, 215)], [0, 50, 100], wash)
        out[.temp] = plain("Temperature (°C)", [
            s(-60, W.flowTempFrigid, 235), s(-30, W.flowTempFrigid, 235), s(-10, W.flowTempCold, 235), s(0, W.flowTempFreezing, 235),
            s(10, W.flowTempCool, 235), s(20, W.flowTempMild, 235), s(30, W.flowTempWarm, 235), s(40, W.flowTempHot, 235), s(45, W.flowTempHot, 235),
        ], [-30, -15, 0, 15, 30, 45], solid)
        out[.vis] = plain("Visibility (SM)", [s(0, W.flowVisLow, 200), s(5, W.flowVisHigh, 90), s(10, W.flowVisHigh, 0)], [0, 5, 10], wash)

        // AWC's icing categories 1 to 4 (0 is none, clear), a whole step each.
        let icingWords = grid.icing.filter { $0.from > 0 }
        let icingColours = [W.flowIcingTrace, W.flowIcingLight, W.flowIcingModerate, W.flowIcingHeavy]
        if icingWords.count == 4 {
            let (bar, ticks) = blocks(icingWords.map(\.word), icingColours)
            let ramp = steps(icingWords.map { $0.from - 0.5 }, icingColours, 210, top: icingWords[3].from + 0.5)
            out[.icing] = FieldLook(title: "Icing severity", ramp: ramp, bar: bar, ticks: ticks, opacity: 0.8)
        }
        let turbRow = grid.turbulence.light
        let turbColours = [W.flowTurbLight, W.flowTurbModerate, W.flowTurbSevere, W.flowTurbExtreme]
        if turbRow.count == 4 {
            let (bar, ticks) = blocks(turbRow.map(\.word), turbColours)
            out[.turb] = FieldLook(title: "Turbulence, under 15,500 lb", ramp: steps(turbRow.map(\.from), turbColours, 200, top: 1), bar: bar, ticks: ticks, opacity: 0.8)
        }
        let level = { (ft: Double) in ft <= 0 ? "Sfc" : Format.mapLevel(ft) }
        out[.frzlvl] = plain("Freezing level (MSL)", [s(0, W.flowFrzLow, 200), s(8000, W.flowFrzMid, 180), s(16000, W.flowFrzHigh, 170)],
                             [0, 4000, 8000, 12000, 16000], 0.75, label: level)
        out[.tops] = plain("Cloud tops (MSL)", [s(0, W.flowTopsLow, 120), s(40000, W.flowTopsHigh, 220)], [10000, 20000, 30000, 40000], 0.75, label: level)
        return out
    }
}
