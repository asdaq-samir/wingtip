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

    /// A mark's words at night dimmed by colour to the paper's light, their
    /// halo left opaque: the night ink times the words' share (wordLight).
    @Test func aWordIsDimmedToThePapersLight() throws {
        let ink = UIColor(red: 0.9, green: 0.9, blue: 0.9, alpha: 1)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        #expect(MarkDim.word(ink, brightness: 0.5).getRed(&r, green: &g, blue: &b, alpha: &a))
        // The night's default Dimmer: the words at 0.77 of their ink (the
        // web's wordLight at contrast 0.13).
        #expect(abs(r - 0.9 * 0.77) < 1e-3 && a == 1)
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

    // MARK: The cases every app is held to (apps/web/src/lib/fixtures/mapDim.json)

    private final class FixtureBundle {}

    private func shared() throws -> [String: Any] {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "mapDim", withExtension: "json"))
        return try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func cases(_ section: String) throws -> [[String: Any]] {
        try #require((try shared()[section] as? [String: Any])?["cases"] as? [[String: Any]])
    }

    /// The sections the fixture names iOS in are exactly those tested here.
    @Test func iOSKeepsEverySectionTheFixtureNamesItIn() throws {
        let named = try shared().compactMap { key, value in ((value as? [String: Any])?["apps"] as? [String])?.contains("ios") == true ? key : nil }
        #expect(Set(named) == ["dim", "colour", "nightInks"])
    }

    @Test func theSharedDims() throws {
        for c in try cases("dim") {
            let night = try #require(c["night"] as? Bool), b = try #require(c["brightness"] as? Double), dim = try #require(c["dim"] as? Double)
            #expect(abs(MarkDim.alpha(shade: CGFloat(1 - b), night: night) - CGFloat(dim)) < 1e-9, "\(c)")
        }
    }

    @Test func theSharedColoursGoToBlackWithTheDim() throws {
        for c in try cases("colour") {
            // One #require a line: a #require inside another is a recursive
            // macro expansion, which Xcode 27.2 refuses.
            let token = try #require(c["colour"] as? String), dimmedToken = try #require(c["dimmed"] as? String)
            let colour = try #require(UIColor(token: token))
            let dim = try #require(c["dim"] as? Double), want = try #require(UIColor(token: dimmedToken))
            var got = (r: CGFloat(0), g: CGFloat(0), b: CGFloat(0), a: CGFloat(0)), expected = got
            let dimmed = try #require(OverlayDim.colour(colour, brightness: CGFloat(dim)))
            #expect(dimmed.getRed(&got.r, green: &got.g, blue: &got.b, alpha: &got.a))
            #expect(want.getRed(&expected.r, green: &expected.g, blue: &expected.b, alpha: &expected.a))
            // Within a step of 255: the web rounds each channel, UIKit keeps the fraction.
            #expect(abs(got.r - expected.r) <= 1 / 255 && abs(got.g - expected.g) <= 1 / 255 && abs(got.b - expected.b) <= 1 / 255, "\(c)")
        }
    }

    /// The words' share is the engine's map_dim_words, its cases its own
    /// (engine/facade/tests/map_dim.rs): asked, and asked again from the
    /// share kept, alike.
    @Test func theWordsLightIsTheEngines() throws {
        let words = try cases("words")
        let c = try #require(words.first(where: { $0["night"] as? Bool == true }))
        let b = try #require(c["brightness"] as? Double), k = try #require(c["contrast"] as? Double)
        let share = try #require(c["share"] as? Double)
        #expect(WordLight.share(brightness: b, contrast: k) == share, "\(c)")
        #expect(WordLight.share(brightness: b, contrast: k) == share, "\(c)")
    }

    @Test func theSharedNightInks() throws {
        let inks = try #require((try shared()["nightInks"] as? [String: Any])?["inks"] as? [String: String])
        let dark = UITraitCollection(userInterfaceStyle: .dark)
        for (day, night) in inks {
            let ink = MapLabelLook.ink(try #require(UIColor(token: day)))
            #expect(MapLabelLook.hex(ink.resolvedColor(with: dark)) == night, "\(day)")
        }
    }
}
