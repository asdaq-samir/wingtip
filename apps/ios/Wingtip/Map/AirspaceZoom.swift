import Foundation

/// From which Leaflet zoom each class and the tabs are drawn: design/tokens.json's map.zoom, the web's AIRSPACE_FROM.
enum AirspaceZoom {
    static func from(_ cls: String) -> Double {
        switch cls {
        case "B": return WingtipMapZoom.airspaceB
        case "C": return WingtipMapZoom.airspaceC
        default: return WingtipMapZoom.airspaceD
        }
    }
    static let tabsFrom = WingtipMapZoom.airspaceLabels

    /// How many of the classes' zooms a zoom has passed: the lines wanted
    /// change only as this does.
    static func band(_ zoom: Double) -> Int {
        [WingtipMapZoom.airspaceB, WingtipMapZoom.airspaceC, WingtipMapZoom.airspaceD].count { zoom >= $0 }
    }
}
