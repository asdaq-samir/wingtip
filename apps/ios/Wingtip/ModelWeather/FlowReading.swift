import Foundation

/// The value at a tapped point as the badge says it, three lines as the
/// web's FlowBubble has them: what it is above, the figure, its unit or
/// word under. Every word of a rule is the engine's: where the wind blows
/// from as one of the 16 points (compass_point, JO 7930.2 3-3-9), the
/// precipitation's intensity (precip_intensity, AIM 7-1-12), CAPE's
/// category (cape_category, the NWS's), AWC's icing severity
/// (icing_severity) and turbulence category (turbulence_category, the
/// "light" weight class's thresholds); the rest is formatting.
struct FlowReading: Equatable, Sendable {
    var over: String?
    var figure: String
    var under: String

    /// The badge for `field`'s `value` (FlowGrid.value), where `top` is the
    /// field's picture's highest value, `fromDeg` the wind's direction and
    /// `tempC` the temperature there (the precipitation's, and the wind's
    /// at its level). An engine rule that fails throws, as the web's
    /// callEngine does, and the caller shows no reading and says why: the
    /// engine's nil is "none" (no icing, turbulence under its lightest
    /// band), but a failed rule is not, and must never read as no hazard.
    static func of(_ field: FlowFieldKind, value: Double, unit: String, top: Double?, fromDeg: Double? = nil, tempC: Double? = nil) throws -> FlowReading {
        switch field {
        case .precip:
            let said = try Engine.precipIntensity(dbz: value, tempC: tempC)
            return FlowReading(over: nil, figure: tempC.map { "\(Int($0.rounded()))°" } ?? "–", under: said.word ?? "")
        case .icing:
            return FlowReading(over: nil, figure: try Engine.icingSeverity(category: value) ?? "–", under: "icing")
        case .turb:
            let word = try Engine.turbulenceCategory(edr: value, weightClass: FlowLooks.turbulenceClass)
            return FlowReading(over: "EDR \(Format.number(value, decimals: 2))", figure: word ?? "None", under: "turb")
        case .frzlvl:
            return value <= 0 ? FlowReading(over: "Freezing", figure: "Sfc", under: "level")
                : FlowReading(over: "Freezing", figure: Format.mapLevel(value), under: "MSL")
        case .tops:
            return FlowReading(over: "Tops", figure: Format.mapLevel(value), under: "MSL")
        case .ceiling:
            // The picture keeps a ceiling over its top, and none, at the
            // top (the weather service's flow_grid): either is no ceiling
            // AIM 7-1-7's categories turn on.
            if let top, value >= top - 25 { return FlowReading(over: nil, figure: "None", under: "ceiling") }
            return FlowReading(over: nil, figure: Format.grouped((value / 50).rounded() * 50), under: "ft agl")
        case .cape:
            return FlowReading(over: try Engine.capeCategory(jKg: value), figure: String(Int(value.rounded())), under: unit)
        case .vis:
            return FlowReading(over: nil, figure: Format.number(value, decimals: value < 3 ? 1 : 0), under: unit)
        case .wind:
            let over = try fromDeg.map { try Engine.compassPoint(bearingDeg: $0) }
            let under = tempC.map { "\(unit) \(Int($0.rounded()))°" } ?? unit
            return FlowReading(over: over, figure: String(Int(value.rounded())), under: under)
        case .gust, .cloud, .temp, .off:
            return FlowReading(over: nil, figure: String(Int(value.rounded())), under: unit)
        }
    }
}

/// The levels a field is drawn at, by AWC's names ("sfc", "060", "max"),
/// as the weather service lists them (the layer's `levels`, the engine's
/// flow_levels), and the pictures' names: the web's flowLevels.
enum FlowLevels {
    static func levels(_ layer: APIFlowLayer?, _ field: FlowFieldKind) -> [String] {
        let levels = layer?.levels?.additionalProperties ?? [:]
        switch field {
        case .wind: return levels["wind"] ?? []
        case .temp: return (levels["wind"] ?? []).filter { $0 != "max" }
        case .icing: return levels["icing"] ?? []
        case .turb: return levels["turbulence"] ?? []
        default: return []
        }
    }

    /// The level shown: the pilot's pick where the field has it, else its first.
    static func shown(_ layer: APIFlowLayer?, _ field: FlowFieldKind, picked: String) -> String? {
        let all = levels(layer, field)
        return all.contains(picked) ? picked : all.first
    }

    /// A field's picture at a level: the surface's under the field's own
    /// name, a level's after a dash ("wind-060", "turb-max").
    static func file(_ field: String, _ level: String?) -> String {
        guard let level, level != "sfc" else { return field }
        return "\(field)-\(level)"
    }

    /// A level as the menu says it: "Surface", "Max", or the map's flight
    /// level, its feet the engine's (flow_levels).
    @MainActor
    static func name(_ id: String) -> String {
        if id == "sfc" { return "Surface" }
        if id == "max" { return "Max" }
        guard let all = try? Engine.flowLevels() else { return id }
        let ft = all.wind.first { $0.id == id }?.ft ?? all.icing.first { $0.id == id }?.ft ?? all.turbulence.first { $0.id == id }?.ft
        return ft.map(Format.mapLevel) ?? id
    }
}
