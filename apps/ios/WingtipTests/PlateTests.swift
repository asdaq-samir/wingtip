import CoreLocation
import MapKit
import Testing
import UIKit
@testable import Wingtip

/// The plate on the map and its card (the owner's ForeFlight screenshots,
/// 2026-11-11): which plates are drawn, the card's settings on the page,
/// where a tap lands, and the tags on the approach's fixes.
@MainActor
struct PlateTests {
    private let ils36 = ProcedurePick(ident: "KOSH", id: "I36", kind: "approach", name: "ILS OR LOC RWY 36")
    private let star = ProcedurePick(ident: "KOSH", id: "FISK2", kind: "arrival", name: "FISK TWO")

    // MARK: Which plates are drawn

    @Test func everyApproachOnTheRouteIsDrawnButThoseHidden() {
        let rnav = ProcedurePick(ident: "KATW", id: "R03", kind: "approach", name: "RNAV (GPS) RWY 3")
        #expect(PlateLayer.shown(plates: true, approaches: [ils36, star, rnav], hidden: []).map(PlateKey.of) == ["KOSH:I36", "KATW:R03"])
        #expect(PlateLayer.shown(plates: true, approaches: [ils36, rnav], hidden: ["KOSH:I36"]).map(PlateKey.of) == ["KATW:R03"])
        #expect(PlateLayer.shown(plates: false, approaches: [ils36], hidden: []).isEmpty)
    }

    @Test func hidePlateTakesItOffUntilPickedAgainOrTheSwitch() {
        let hidden = HiddenPlates()
        hidden.hide("KOSH:I36")
        hidden.picked(["KOSH:I36"], before: ["KOSH:I36"])
        #expect(hidden.keys == ["KOSH:I36"], "a plate stays hidden while its approach stays picked")
        hidden.picked(["KOSH:I36"], before: [])
        #expect(hidden.keys.isEmpty, "picked again, the plate is back")
        hidden.hide("KOSH:I36")
        hidden.showAll()
        #expect(hidden.keys.isEmpty, "the Map card's Approach Plates turned on brings every plate back")
    }

    // MARK: The card's settings on the page

    private func page() -> PlateMapOverlay {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 6)).image { _ in }
        let placement = PlatePlacement(corners: [
            CLLocationCoordinate2D(latitude: 44.1, longitude: -88.7), CLLocationCoordinate2D(latitude: 44.1, longitude: -88.4),
            CLLocationCoordinate2D(latitude: 43.8, longitude: -88.4), CLLocationCoordinate2D(latitude: 43.8, longitude: -88.7),
        ])!
        return PlateMapOverlay(key: "KOSH:I36", name: "ILS OR LOC RWY 36", placement: placement, image: image)
    }

    @Test func theTransparencySliderSetsThePagesOpacity() {
        let renderer = PlateRenderer(overlay: page(), look: PlateLook())
        #expect(renderer.alpha == CGFloat(PlateLook.defaultOpacity))
        renderer.show(PlateLook(opacity: 0.4))
        #expect(abs(renderer.alpha - 0.4) < 1e-9)
        #expect(renderer.look.opacity == 0.4)
    }

    @Test func invertAndAnnotationsReachTheRenderer() {
        let renderer = PlateRenderer(overlay: page(), look: PlateLook())
        #expect(!renderer.look.inverted && renderer.look.annotations)
        renderer.show(PlateLook(inverted: true, annotations: false))
        #expect(renderer.look.inverted)
        #expect(!renderer.look.annotations)
    }

    @Test func theLayerHandsTheCardsLookToItsPages() {
        let layer = PlateLayer()
        let map = MKMapView()
        layer.update(map, picks: [], look: PlateLook(opacity: 0.3, inverted: true, annotations: false), tiles: nil)
        #expect(layer.look == PlateLook(opacity: 0.3, inverted: true, annotations: false))
        let renderer = layer.renderer(for: page()) as? PlateRenderer
        #expect(renderer?.look.inverted == true)
        #expect(abs((renderer?.alpha ?? 0) - 0.3) < 1e-9)
    }

    // MARK: Where the page lies and a tap on it

    @Test func aTapInsideATurnedPageIsThePlates() {
        // A page turned 45 degrees: a diamond round its middle.
        let turned = PlatePlacement(corners: [
            CLLocationCoordinate2D(latitude: 44.2, longitude: -88.5), CLLocationCoordinate2D(latitude: 44.0, longitude: -88.3),
            CLLocationCoordinate2D(latitude: 43.8, longitude: -88.5), CLLocationCoordinate2D(latitude: 44.0, longitude: -88.7),
        ])!
        #expect(turned.contains(MKMapPoint(CLLocationCoordinate2D(latitude: 44.0, longitude: -88.5))))
        // Inside the box round it, outside the page.
        #expect(!turned.contains(MKMapPoint(CLLocationCoordinate2D(latitude: 44.17, longitude: -88.33))))
        #expect(PlatePlacement(corners: Array(turned.corners.prefix(3))) == nil)
    }

    @Test func thePictureIsLaidOnItsCorners() {
        let t = PlatePlacement.transform(size: CGSize(width: 100, height: 200), topLeft: CGPoint(x: 10, y: 10), topRight: CGPoint(x: 110, y: 60), bottomLeft: CGPoint(x: -90, y: 210))
        #expect(CGPoint(x: 0, y: 0).applying(t) == CGPoint(x: 10, y: 10))
        #expect(CGPoint(x: 100, y: 0).applying(t) == CGPoint(x: 110, y: 60))
        #expect(CGPoint(x: 0, y: 200).applying(t) == CGPoint(x: -90, y: 210))
    }

    // MARK: The card

    @Test func theCardOpensFromItsKeptName() {
        #expect(SheetPage(stored: "+plate:KOSH:I36") == .plate("KOSH:I36"))
        #expect(SheetPage.plate("KOSH:I36").stored == "+plate:KOSH:I36")
        #expect(SheetPage.plate("KOSH:I36").testID == "card-plate")
        #expect(!SheetPage.plate("KOSH:I36").opensFull, "a thing: half way, the map in sight")
        #expect(SheetPage(stored: "+plate:KOSH") == nil)
    }

    @Test func viewFullScreenFindsTheFAAsChartByItsTitle() {
        let charts = [
            TerminalChart(kind: "APD", name: "AIRPORT DIAGRAM", url: "https://aeronav.faa.gov/d-tpp/2611/00726ad.pdf"),
            TerminalChart(kind: "IAP", name: "ILS OR LOC RWY 36", url: "https://aeronav.faa.gov/d-tpp/2611/00726il36.pdf"),
        ]
        #expect(PlateCardModel.chart(named: "ILS or LOC RWY 36", in: charts)?.url.hasSuffix("00726il36.pdf") == true)
        #expect(PlateCardModel.chart(named: "VOR RWY 9", in: charts) == nil)
    }

    // MARK: The tags (the view model)

    private let pober = CLLocationCoordinate2D(latitude: 43.89, longitude: -88.56)

    @Test func atOrAboveIsUnderlinedWithTheGlideslopeUnder() {
        let tag = PlateFixTag(ident: "POBER", coordinate: pober, sense: .atOrAbove, minFt: 2700, glidepathFt: 2610)
        #expect(PlateTagLines.lines(tag) == [
            PlateTagLine(text: "POBER", weight: .name),
            PlateTagLine(text: "2,700'", bars: .under),
            PlateTagLine(text: "GS 2,610'", weight: .note),
        ])
        #expect(PlateTagLines.spoken(tag) == "POBER, 2,700' or above, GS 2,610'")
    }

    @Test func atOrBelowAtAndBetweenCarryTheFAAsBars() {
        #expect(PlateTagLines.lines(PlateFixTag(ident: "A", coordinate: pober, sense: .atOrBelow, maxFt: 4000))[1] == PlateTagLine(text: "4,000'", bars: .over))
        #expect(PlateTagLines.lines(PlateFixTag(ident: "B", coordinate: pober, sense: .at, minFt: 3000, maxFt: 3000))[1] == PlateTagLine(text: "3,000'", bars: .both))
        let window = PlateTagLines.lines(PlateFixTag(ident: "C", coordinate: pober, sense: .between, minFt: 2500, maxFt: 5000))
        #expect(window.dropFirst().map(\.bars) == [.over, .under])
        #expect(window.dropFirst().map(\.text) == ["5,000'", "2,500'"])
    }

    /// KOSH's ILS RWY 36 from the shared fixture (approachKosh.json), its
    /// drawing tagged by the engine and drawn as the plate prints it: POBER
    /// at or above 2,700 with the glide slope's 2,610, CFBSM 2,700, the
    /// runway's TCH 53 and TDZE 809, the final segment POBER to RW36.
    @Test func koshILS36IsTaggedAsItsPlateIs() throws {
        let url = try #require(Bundle(for: FixtureAnchor.self).url(forResource: "approachKosh", withExtension: "json"))
        let whole = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let drawings = try #require(whole["drawings"] as? [String: Any])
        let drawing = try CoachApproaches.drawing(JSONSerialization.data(withJSONObject: try #require(drawings["I36"])))
        let tags = PlateTags.of(drawing)
        let lines = Dictionary(tags.fixes.map { ($0.ident, PlateTagLines.lines($0)) }, uniquingKeysWith: { a, _ in a })
        #expect(lines["POBER"] == [
            PlateTagLine(text: "POBER", weight: .name), PlateTagLine(text: "2,700'", bars: .under), PlateTagLine(text: "GS 2,610'", weight: .note),
        ])
        #expect(lines["CFBSM"]?.dropFirst().first == PlateTagLine(text: "2,700'", bars: .under))
        #expect(lines["RW36"]?.map(\.text) == ["RW36", "TCH 53'", "TDZE 809'"])
        #expect(tags.finalSegment.count == 2)
        #expect(abs((tags.finalSegment.first?.latitude ?? 0) - 43.873792) < 1e-6, "the final segment starts at POBER, the FAF")
    }

    @Test func theRunwayShowsItsThresholdNotAMinimum() {
        let rw36 = PlateFixTag(ident: "RW36", coordinate: pober, thresholdCrossingFt: 53, touchdownZoneFt: 809)
        #expect(PlateTagLines.lines(rw36).map(\.text) == ["RW36", "TCH 53'", "TDZE 809'"])
    }
}

/// The test bundle, where the shared fixtures are its resources.
private final class FixtureAnchor {}
