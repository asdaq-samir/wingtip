import Foundation

/// Terrain Hazards, ForeFlight's Hazard Advisor on the chart, as the web's
/// (features/plan-map/hazard): the ground and the DOF's obstacles red
/// within the pilot's clearance of the altitude flown, amber a band under
/// it. Every figure is the engine's hazard_view
/// (engine/crates/altitude/src/altitude/hazard.rs): the altitude (the GPS's
/// at flying speed, the plan's cruise on the ground), whether to draw at
/// all, and the red and amber lines from one of its three clearances, each
/// a 14 CFR minimum (91.119(c)'s 500 ft; 91.119(b) and 91.177(a)(2)(ii)'s
/// 1,000 ft, its default; 91.177(a)(2)(i)'s 2,000 ft over mountains). A
/// picture against one altitude, not terrain clearance: no TAWS. Nothing is
/// compared here; the app passes both altitudes and the engine decides.
enum TerrainHazard {
    /// The Map card's setting (its one home, HazardRows): off unless picked.
    enum Setting: String, CaseIterable, Identifiable, Sendable {
        case off, on, flight
        var id: String { rawValue }
        var label: String {
            switch self {
            case .off: "Off"
            case .on: "On"
            case .flight: "In Flight"
            }
        }
    }

    /// The setting and the pilot's clearance, kept on the device as the
    /// web's preferences keep them (hazard, hazardClearanceFt): no
    /// clearance kept is the engine's default, so no figure is held here.
    enum Keys {
        static let setting = "map.hazard"
        static let clearanceFt = "map.hazardClearanceFt"
    }

    typealias View = EngineContract.HazardViewAnswer

    /// The steps the map is coloured again by, ft: the engine reads the
    /// GPS's height in its own 50 ft steps, rounded down (hazard_view), so
    /// a height wandering within one asks nothing new. A repaint key, not
    /// a rule: the height is sent as read and the bands are the engine's.
    static let stepFt = 50.0

    /// The whole step a height is in, for telling a new colouring from a
    /// few feet's wander; nil with no height.
    static func step(_ ft: Double?) -> Int? {
        ft.map { Int(($0 / stepFt).rounded(.down)) }
    }

    /// The colouring now, from the setting, the GPS's speed and height and
    /// the plan's cruise; `topsFt`, obstacle tops MSL, each levelled.
    static func view(setting: Setting, clearanceFt: Double?, speedKt: Double?, gpsFt: Double?, plannedFt: Double?,
                     topsFt: [Double] = []) throws -> View {
        try Engine.hazardView(setting: setting.rawValue, speedKt: speedKt, gpsAltitudeFt: gpsFt, plannedAltitudeFt: plannedFt,
                              clearanceFt: clearanceFt, topsFt: topsFt)
    }

    /// The obstacles' levels against the very altitude the ground is
    /// coloured from: the engine asked again with that altitude as the plan's
    /// (setting on, no fix), as the web's HazardGl levels them.
    static func levels(of topsFt: [Double], altitudeFt: Double, clearanceFt: Double?) throws -> [String?] {
        try Engine.hazardView(setting: Setting.on.rawValue, plannedAltitudeFt: altitudeFt, clearanceFt: clearanceFt, topsFt: topsFt).levels
    }

    /// The clearances the pilot may pick, and the one in use, the engine's.
    static func clearances(picked: Double?) throws -> (offered: [Double], inUse: Double) {
        let figures = try Engine.hazardView(setting: Setting.off.rawValue, clearanceFt: picked)
        return (figures.clearancesFt, figures.clearanceFt)
    }
}

/// What the map's hazard colouring is drawn from, handed in by RootMap with
/// the map's other extras (MapExtrasInput.hazard).
struct HazardInput: Equatable {
    var setting = TerrainHazard.Setting.off
    var clearanceFt: Double?
    /// Own ship's GPS: its ground speed, kt, and height, ft.
    var speedKt: Double?
    var gpsFt: Double?
    /// The plan's cruise, ft MSL.
    var plannedFt: Double?

    /// The same colouring asked: every figure alike, the height by its
    /// whole step (TerrainHazard.step), as the engine reads it.
    func same(_ other: HazardInput) -> Bool {
        setting == other.setting && clearanceFt == other.clearanceFt && speedKt == other.speedKt
            && TerrainHazard.step(gpsFt) == TerrainHazard.step(other.gpsFt) && plannedFt == other.plannedFt
    }
}
