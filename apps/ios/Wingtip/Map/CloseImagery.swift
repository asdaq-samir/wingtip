import MapKit
import Observation

/// How much of the chart shows at a zoom (the web map's closeZoom
/// chartFade, in the app's levels as MapExtras.zoom gives them): all of it
/// to the chart's own last level (`last`, its tiles' {z}: the sectional's
/// 12), where its tiles stop having more to show, then less over one
/// level, to none a level past it, where the imagery under it
/// (CloseImagery) and the FAA runways (RunwaySurface) are the map. The
/// sectional enlarged past its last level is a blur (the owner at KDEN,
/// 2026-11-12).
enum ChartFade {
    static func alpha(zoom: Double, last: Int) -> CGFloat {
        CGFloat(min(1, max(0, Double(last) + 1 - zoom)))
    }

    /// The imagery's: in over the half level before the chart starts to
    /// fade, so the chart never fades over nothing (closeZoom's imageryFade).
    static func imagery(zoom: Double, last: Int) -> CGFloat {
        CGFloat(min(1, max(0, (zoom - (Double(last) - 0.5)) / 0.5)))
    }
}

/// The USGS's aerial imagery of the United States (The National Map's
/// USGSImageryOnly: NAIP's 0.6 to 1 m photographs over the lower 48,
/// partners' over Alaska, Hawaii, Puerto Rico and the territories), a
/// public-domain work (17 U.S.C. 105) any app may draw, as the web's close
/// in (lib/map/sources/imagery). Apple's own imagery is not used: its
/// terms show Apple Maps data only on Apple's map, not under the FAA's
/// chart. MapKit's stock tile overlay, its tiles z/y/x, none asked for
/// further out than the half level before the chart fades.
final class CloseImageryOverlay: MKTileOverlay, @unchecked Sendable {
    static let template = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"
    /// Its last level of tiles: the service's maxScale, 1:9,028, is {z} 16
    /// (checked by the web's commit 28b4cf379, 2026-11-12: 404 at 17).
    static let maxLevel = 16
    /// Its credit, as the web writes it (the USGS asks it, not requires it).
    static let credit = "Imagery USGS The National Map"

    /// The chart's own last level the imagery comes in under.
    let last: Int

    init(under last: Int) {
        self.last = last
        super.init(urlTemplate: Self.template)
        minimumZ = max(0, last - 1)
        maximumZ = Self.maxLevel
        canReplaceMapContent = false
    }
}

/// The imagery on the map: put under the chart as the chart is put on, its
/// renderer faded in as the chart fades out, and whether it shows, for its
/// credit over the map (RootView's chips). Where the USGS has no tile (the
/// sea, Canada past the border's fringe, offline) Apple's muted map is
/// under it, as it was under the chart before.
@MainActor @Observable
final class CloseImagery {
    static let shared = CloseImagery()

    /// Whether any of the imagery shows now.
    private(set) var drawn = false
    @ObservationIgnored private var overlay: CloseImageryOverlay?
    @ObservationIgnored private var renderer: MKTileOverlayRenderer?

    /// The imagery put just under `chart` on the map, in place of the one
    /// under the chart before.
    func place(on map: MKMapView, under chart: ChartTileOverlay) {
        if let overlay { map.removeOverlay(overlay) }
        renderer = nil
        let imagery = CloseImageryOverlay(under: chart.maxZoom)
        map.insertOverlay(imagery, below: chart)
        overlay = imagery
    }

    /// MapKit's stock renderer for it, at its fade for `zoom`.
    func renderer(_ imagery: CloseImageryOverlay, zoom: Double) -> MKOverlayRenderer {
        let made = MKTileOverlayRenderer(tileOverlay: imagery)
        made.alpha = ChartFade.imagery(zoom: zoom, last: imagery.last)
        renderer = made
        return made
    }

    /// The chart's and the imagery's fades as the view moves.
    func fade(chart: MKOverlayRenderer?, last: Int?, zoom: Double) {
        guard let last else { return }
        chart?.alpha = ChartFade.alpha(zoom: zoom, last: last)
        let alpha = ChartFade.imagery(zoom: zoom, last: last)
        renderer?.alpha = alpha
        if drawn != (alpha > 0) { drawn = alpha > 0 }
    }
}
