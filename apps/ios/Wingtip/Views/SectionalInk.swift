import UIKit

/// The chart colours the overlays wear, each the web map's own
/// (lib/useAirspace, lib/map/gl/glStyle.ts AIRSPACE_INK, glOverlays).
/// They are the chart's and stay the same at night, as the sectional
/// under them does.
enum SectionalInk {
    /// The sectional's airport and VOR blue and its magenta (web
    /// useAirspace BLUE and MAGENTA): "Airports having control towers are
    /// shown in blue, all others in magenta" (FAA Aeronautical Chart
    /// User's Guide, VFR Terms and Symbols, Airports).
    static let blue = WingtipColor.Chart.towered
    static let magenta = WingtipColor.Chart.untowered
    /// A field whose tower is not known yet (web airportMark UNKNOWN_GREY).
    static let unknown = WingtipColor.Chart.fieldUnknown

    static func airport(towered: Bool?) -> UIColor {
        switch towered {
        case true?: return blue
        case false?: return magenta
        case nil: return unknown
        }
    }

    /// The airspace's lines in ForeFlight's brighter blue and magenta
    /// (glStyle AIRSPACE_INK): Class B solid blue, C solid magenta, D
    /// dashed blue, as the sectional codes them (Chart User's Guide,
    /// Airspace).
    static let airspaceBlue = WingtipColor.Chart.airspaceBlue
    static let airspaceMagenta = WingtipColor.Chart.airspaceMagenta
    /// The dark tab an airspace's altitudes sit in.
    static let tab = WingtipColor.Chart.airspaceTab.withAlphaComponent(0.9)
    /// A runway's surface and the halo of its numbers (glOverlays'
    /// runwayLayers: ForeFlight's dark grey over its street map).
    static let runway = WingtipColor.Chart.runwayHard
    /// A soft runway's (turf, grass, dirt, gravel): the web's olive for
    /// a runway that is not hard (glOverlays' runway-surface fill).
    static let softRunway = WingtipColor.Chart.runwaySoft
    static let runwayHalo = WingtipColor.Chart.fixInk
}

// MARK: - What the planner and the packs answer
