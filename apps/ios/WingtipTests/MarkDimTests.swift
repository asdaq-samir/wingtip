import MapKit
import Testing
@testable import Wingtip

/// The Dimmer over the map's marks at night (MarkDim), as the web's mapDim.
struct MarkDimTests {
    @Test func atNightTheMarksTakeTheChartsBrightness() {
        #expect(MarkDim.alpha(shade: 0.5, night: true) == 0.5)
        #expect(MarkDim.alpha(shade: ChartLook.dimMax, night: true) == 1 - ChartLook.dimMax)
        #expect(MarkDim.alpha(shade: 0, night: true) == 1)
    }

    @Test func byDayTheMarksStayAtFullLight() {
        #expect(MarkDim.alpha(shade: 0.4, night: false) == 1)
    }

    @Test func ownShipIsNeverDimmed() {
        #expect(!MarkDim.dims(PlaneAnnotation()))
        #expect(MarkDim.dims(MKPointAnnotation()))
    }

    @Test func thePlatesTakeTheMapsShade() {
        #expect(MapExtrasInput().shaded(0.3).plateLook.page.shade == 0.3)
    }

    /// Dimmed by colour, the web's DIM_BY_COLOUR: the colour times the
    /// chart's brightness, its alpha kept; itself at full light.
    @Test func aLineIsDimmedByItsColourItsAlphaKept() throws {
        let edge = UIColor(red: 1, green: 0.5, blue: 0, alpha: 0.6)
        let dimmed = try #require(OverlayDim.colour(edge, brightness: 0.5))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        #expect(dimmed.getRed(&r, green: &g, blue: &b, alpha: &a))
        #expect(abs(r - 0.5) < 1e-6 && abs(g - 0.25) < 1e-6 && b == 0 && abs(a - 0.6) < 1e-6)
        #expect(OverlayDim.colour(edge, brightness: 1) === edge)
        #expect(OverlayDim.colour(nil, brightness: 0.5) == nil)
    }

    /// A mark's words at night dimmed by colour so their luminance falls
    /// with the paper's, their halo left opaque: the sRGB times the
    /// brightness to the 1/2.2.
    @Test func aWordIsDimmedToThePapersLight() throws {
        let ink = UIColor(red: 0.9, green: 0.9, blue: 0.9, alpha: 1)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        #expect(MarkDim.word(ink, brightness: 0.5).getRed(&r, green: &g, blue: &b, alpha: &a))
        #expect(abs(r - 0.9 * pow(0.5, 1 / 2.2)) < 1e-3 && a == 1)
        #expect(MarkDim.word(ink, brightness: 1) === ink)
    }

    /// A mark with words keeps its alpha, the words dimmed in it.
    @Test @MainActor func aFieldsIdentKeepsItsHalo() {
        let view = FixMarkView(annotation: nil, reuseIdentifier: nil)
        MarkDim.dim(view, 0.5)
        #expect(view.alpha == 1)
    }

    /// A line MapKit is given takes the dim now, and every one on the map
    /// the next; the terrain tint's tiles are no path, and keep their light.
    @Test @MainActor func theLinesTakeTheDimAsItMoves() throws {
        let dim = OverlayDim()
        let line = MKPolylineRenderer(polyline: MKPolyline())
        line.strokeColor = .white
        _ = dim.take(line)
        #expect(line.strokeColor == .white)
        dim.set(0.5, on: MKMapView())
        #expect(dim.brightness == 0.5)
        let later = MKPolylineRenderer(polyline: MKPolyline())
        later.strokeColor = .white
        _ = dim.take(later)
        // getRed, not getWhite: the dimmed colour is made in HSB, which
        // getWhite may decline to convert.
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        #expect(try #require(later.strokeColor).getRed(&r, green: &g, blue: &b, alpha: &a))
        #expect(abs(r - 0.5) < 1e-6 && abs(g - 0.5) < 1e-6 && abs(b - 0.5) < 1e-6)
    }
}
