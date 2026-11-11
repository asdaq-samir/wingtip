import CoreLocation
import SwiftUI

/// The system's spinner in the middle of what the sheet leaves while the
/// map loads (the owner, 2026-11-10: the stock ProgressView, the Wingtip
/// mark kept for the static launch screen alone). It sits where the map
/// opens on the pilot's last position (MapOpening), over the map until
/// the chart and its overlays are in, and fades as the map shows.
struct MapLoading: View {
    /// The height the sheet covers at the foot of the map.
    let bottom: CGFloat

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color(uiColor: .systemBackground)
                ProgressView("Loading the map")
                    .labelsHidden()
                    .controlSize(.large)
                    .position(x: proxy.size.width / 2,
                              y: MapOpening.middle(height: proxy.size.height, top: proxy.safeAreaInsets.top, bottomInset: bottom))
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// Where the map opens: on the pilot's last position, kept on the phone,
/// at the web map's opening zoom (lib/map/ownShip OPEN_ZOOM, 8), in the
/// middle of what the sheet leaves -- under the loading mark -- with the
/// sheet's height as it is when the map is put there, not as it was when
/// the map was made (the web's #543: a sheet that settled while the map
/// loaded left the position below the mark).
enum MapOpening {
    static let zoom = 8.0
    static let key = "map.lastPosition"
    /// Another opening zoom asked for at launch (`-map.openZoom 15`, the
    /// arguments' defaults), for the pictures of the map close in; nil
    /// otherwise.
    static var zoomAsked: Double? {
        let asked = UserDefaults.standard.double(forKey: "map.openZoom")
        return asked > 0 ? asked : nil
    }
    /// The Great Lakes, before any position is known: the web's opening view.
    static let fallback = CLLocationCoordinate2D(latitude: 42.3, longitude: -88.0)

    /// The height of the middle of what the sheet leaves, from the top of
    /// a map `height` tall with `top` under the status bar.
    static func middle(height: CGFloat, top: CGFloat, bottomInset: CGFloat) -> CGFloat {
        (top + height - bottomInset) / 2
    }

    /// How far below a point the map's own middle is put, for the point to
    /// sit in the middle of what the sheet leaves.
    static func drop(height: CGFloat, top: CGFloat, bottomInset: CGFloat) -> CGFloat {
        height / 2 - middle(height: height, top: top, bottomInset: bottomInset)
    }

    /// The longitude a map `width` points wide spans at a Leaflet zoom
    /// (MapExtras.zoom's inverse).
    static func longitudeDelta(zoom: Double, width: Double) -> Double {
        360 * width / 256 / pow(2, zoom)
    }

    static func remembered(_ defaults: UserDefaults = .standard) -> CLLocationCoordinate2D? {
        guard let kept = defaults.array(forKey: key) as? [Double], kept.count == 2,
              (-90...90).contains(kept[0]), (-180...180).contains(kept[1]) else { return nil }
        return CLLocationCoordinate2D(latitude: kept[0], longitude: kept[1])
    }

    static func remember(_ at: CLLocationCoordinate2D, _ defaults: UserDefaults = .standard) {
        defaults.set([at.latitude, at.longitude], forKey: key)
    }
}
