import CoreLocation
import Foundation
import MapKit
import Testing
import UIKit
@testable import Wingtip

/// The map's look brought over from the web map (#510, #539, #541-#543):
/// the chart's day lift, the sectional's airport inks, the
/// airspace tabs, when the overlays are asked again during a pinch, the
/// chart giving way to Apple's map close in, and where the map opens
/// under the loading mark. Each against the web's own figures
/// (glStyle.ts, glOverlays.ts, airportMark.ts, MapLoading.tsx).
private final class LookBundle {}

struct MapLookTests {
    // MARK: The day's lift

    @Test func theDayLiftIsTheWebMapsContrastAndSaturation() throws {
        // MapLibre's raster-contrast and raster-saturation of 0.1, each a
        // factor of 1 / (1 - 0.1).
        #expect(abs(ChartLift.contrast - 1.1111) < 0.001)
        #expect(abs(ChartLift.saturation - 1.1111) < 0.001)
    }

    @Test func aLiftedTileHasMoreContrastThanThePrintedOne() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let tile = UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256), format: format).image { context in
            UIColor(red: 0.8, green: 0.75, blue: 0.7, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
        }
        let png = try #require(tile.pngData())
        let plain = try #require(ChartTileImage.decode(png, lift: false))
        let lifted = try #require(ChartTileImage.decode(png, lift: true))
        let a = try #require(Self.firstPixel(plain)), b = try #require(Self.firstPixel(lifted))
        // A light paper colour goes lighter, its red further from its blue.
        #expect(b.r > a.r)
        #expect(b.r - b.b > a.r - a.b)
    }

    private static func firstPixel(_ cg: CGImage) -> (r: Int, g: Int, b: Int)? {
        var pixel = [UInt8](repeating: 0, count: 4)
        guard let context = CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(cg, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return (Int(pixel[0]), Int(pixel[1]), Int(pixel[2]))
    }

    // MARK: The imagery close in

    @Test func theChartFadesIntoTheImageryOverOneLevelPastItsOwnLast() throws {
        // The sectional's last level is 12 (the web's closeZoom).
        #expect(ChartFade.alpha(zoom: 8, last: 12) == 1)
        #expect(ChartFade.alpha(zoom: 12, last: 12) == 1)
        #expect(abs(ChartFade.alpha(zoom: 12.5, last: 12) - 0.5) < 0.001)
        #expect(ChartFade.alpha(zoom: 13, last: 12) == 0)
        #expect(ChartFade.alpha(zoom: 17, last: 12) == 0)
        // The imagery is in over the half level before, so the chart never
        // fades over nothing.
        #expect(ChartFade.imagery(zoom: 11.4, last: 12) == 0)
        #expect(abs(ChartFade.imagery(zoom: 11.75, last: 12) - 0.5) < 0.001)
        #expect(ChartFade.imagery(zoom: 12, last: 12) == 1)
    }

    @Test func aRunwaysSurfaceIsItsOwnWidthBetweenItsEnds() throws {
        // An east-west runway 150 ft wide: its corners 75 ft either side of
        // the centreline at each end.
        let a = CLLocationCoordinate2D(latitude: 41.98, longitude: -87.93)
        let b = CLLocationCoordinate2D(latitude: 41.98, longitude: -87.89)
        let surface = RunwaySurface.between(a, b, widthFt: 150)
        #expect(surface.pointCount == 4)
        let corners = (0..<4).map { surface.points()[$0] }
        let across = corners[0].distance(to: corners[3])
        #expect(abs(across - 150 * 0.3048) < 0.5)
        let along = corners[0].distance(to: corners[1])
        #expect(abs(along - MKMapPoint(a).distance(to: MKMapPoint(b))) < 0.5)
    }

    // MARK: Sectional symbols

    @Test func aToweredFieldIsBlueAndEveryOtherMagenta() throws {
        #expect(SectionalInk.airport(towered: true) == UIColor(hex: 0x2465B8))
        #expect(SectionalInk.airport(towered: false) == UIColor(hex: 0xC0309F))
        #expect(SectionalInk.airport(towered: nil) == UIColor(hex: 0x6B7280))
    }

    @Test func theSymbolGrowsAsTheWebMapsDo() throws {
        #expect(SectionalSymbol.scale(zoom: 3) == 0.7)
        #expect(SectionalSymbol.scale(zoom: 10) == 1)
        #expect(SectionalSymbol.scale(zoom: 13) == 1.25)
        #expect(SectionalSymbol.scale(zoom: 7) > 0.7 && SectionalSymbol.scale(zoom: 7) < 1)
        #expect(SectionalSymbol.radius("large") > SectionalSymbol.radius("small"))
    }

    @Test func aPrivateOrMilitaryFieldWearsItsLetter() throws {
        func pin(military: String?, isPrivate: Bool) -> AirportPin {
            AirportPin(ident: "X", kind: "small", lat: 0, lon: 0, military: military, name: "X", isPrivate: isPrivate)
        }
        #expect(AirportAnnotation(pin(military: "military", isPrivate: false)).use == "military")
        #expect(AirportAnnotation(pin(military: nil, isPrivate: true)).use == "private")
        // A joint-use field is drawn as a public one.
        #expect(AirportAnnotation(pin(military: "joint", isPrivate: false)).use == nil)
    }

    @Test func thePlannersAnswerSaysWhichFieldsAreTowered() throws {
        let json = #"{"ident":"KORD","name":"O'Hare","lat":41.98,"lon":-87.9,"kind":"large","flight_category":null,"military":null,"private":false,"towered":true,"airspace_class":"B","primary_of":"B"}"#
        let pin = try Planner.json.decode(AirportPin.self, from: Data(json.utf8))
        #expect(pin.towered == true)
        let older = #"{"ident":"KORD","name":"O'Hare","lat":41.98,"lon":-87.9,"kind":"large"}"#
        #expect(try Planner.json.decode(AirportPin.self, from: Data(older.utf8)).towered == nil)
    }

    @Test func thePacksSayWhichFieldsAreToweredAsThePlannerDoes() throws {
        let packs = try ["n40w088", "n40w092"].map { name -> Data in
            let url = try #require(Bundle(for: LookBundle.self).url(forResource: name, withExtension: "pack"))
            return try Data(contentsOf: url, options: .alwaysMapped)
        }
        let pins = try #require(CyclePacks.airportsInView(packs: packs, south: 41.8, west: -88.2, north: 42.2, east: -87.6))
        // O'Hare and Chicago Executive have towers (NASR APT_BASE ATCT).
        #expect(pins.first { $0.ident == "KORD" }?.towered == true)
        #expect(pins.first { $0.ident == "KPWK" }?.towered == true)
        #expect(pins.contains { $0.towered == false })
    }

    // MARK: Airspace tabs

    private func volume(_ cls: String, floor: Double, sfc: Bool, ceiling: Double?, excluded: Bool = false,
                        lines: [[[Double]]] = []) -> AirspaceVolume {
        AirspaceVolume(id: "x", ident: nil, name: "x", airspaceClass: cls, floorFt: floor, floorSfc: sfc, ceilingFt: ceiling,
                       ceilingExcluded: excluded, hoursCode: nil, hoursRemark: nil, labelLat: 0, labelLon: 0, lines: lines)
    }

    @Test func aTabSaysTheFloorAndCeilingInFeetAsForeFlightWritesThem() throws {
        #expect(AirspaceTab.text(volume("B", floor: 3000, sfc: false, ceiling: 10000)) == "B: 3000–10000")
        // Madison's Class C shelf (the owner's ForeFlight screenshot).
        #expect(AirspaceTab.text(volume("C", floor: 2300, sfc: false, ceiling: 4900)) == "C: 2300–4900")
        #expect(AirspaceTab.text(volume("D", floor: 0, sfc: true, ceiling: 2500)) == "D: SFC–2500")
        // Up to but not including the Class B over it (TNI).
        #expect(AirspaceTab.text(volume("D", floor: 0, sfc: true, ceiling: 3000, excluded: true)) == "D: SFC–<3000")
        #expect(AirspaceTab.text(volume("C", floor: 0, sfc: true, ceiling: nil)) == nil)
    }

    @Test func aRoundRingsTabIsNorthNorthWestAlongTheRing() throws {
        // A ring round Madison, a point every 5 degrees.
        let lat0 = 43.14, lon0 = -89.35, k = cos(lat0 * .pi / 180)
        let ring: [[Double]] = stride(from: 0.0, through: 360.0, by: 5).map {
            [lat0 + 0.07 * cos($0 * .pi / 180), lon0 + 0.07 * sin($0 * .pi / 180) / k]
        }
        let centre = CLLocationCoordinate2D(latitude: lat0, longitude: lon0)
        let world = MKMapRect.world
        let place = try #require(AirspaceTab.place([ring], centre: centre, in: world))
        let azimuth = atan2((place.at.longitude - lon0) * k, place.at.latitude - lat0) * 180 / .pi
        #expect(abs((azimuth + 360).truncatingRemainder(dividingBy: 360) - 330) <= 3)
        #expect(abs(place.angle + 30) <= 3)
        // None in sight: no tab.
        let away = MKMapRect(origin: MKMapPoint(CLLocationCoordinate2D(latitude: 30, longitude: -100)), size: MKMapSize(width: 10, height: 10))
        #expect(AirspaceTab.place([ring], centre: centre, in: away) == nil)
    }

    @Test func aSpecialUseTabWritesItsLimitsAsForeFlightDoes() throws {
        // Brady North and Brady Low, as the engine places them (sua_tab).
        #expect(SpecialUseTab.limit(3600, ref: "MSL") == "3600")
        #expect(SpecialUseTab.limit(18000, ref: "FL") == "FL180")
        #expect(SpecialUseTab.limit(500, ref: "AGL") == "500AGL")
        #expect(SpecialUseTab.limit(0, ref: "SFC") == "SFC" && SpecialUseTab.limit(nil, ref: "UNL") == "UNL")
        #expect(SpecialUseTab.limit(nil, ref: "MSL") == nil)
        let tab = ChartMarks.Area.Tab(name: "M-BRADY LOW", floorFt: 500, floorRef: "AGL", ceilingFt: 6000, ceilingRef: "MSL",
                                      at: [31, -99], angle: 10, side: 1)
        let area = ChartMarks.Area(type: "MOA", name: "BRADY LOW MOA", floorFt: 500, ceilingFt: 6000, rings: [], label: [31, -99], tab: tab)
        #expect(SpecialUseTabAnnotation(area)?.text == "M-BRADY LOW:\n500AGL-6000")
        // Turned with the map and kept upright, the area then on the
        // text's other side.
        #expect(SpecialUseTab.turn(angle: 10, side: 1, heading: 0) == (10, 1))
        #expect(SpecialUseTab.turn(angle: 10, side: 1, heading: 180) == (10, -1))
    }

    @Test func theBandWidensAsTheMapComesIn() throws {
        #expect(AirspaceVignetteRenderer.width(zoom: 5) == 3)
        #expect(AirspaceVignetteRenderer.width(zoom: 9) == 6)
        #expect(AirspaceVignetteRenderer.width(zoom: 12) == 13)
        #expect(AirspaceVignetteRenderer.width(zoom: 15) == 16)
    }

    // MARK: Asking during a pinch

    @Test func theViewIsAskedAgainOnlyAtANewLevelOrOutsideWhatWasAsked() throws {
        var fetch = ViewFetch()
        let view = ViewBox(south: 41, west: -89, north: 42, east: -88)
        #expect(fetch.wants(view, zoom: 8.2))
        let asked = fetch.ask(view, zoom: 8.2)
        #expect(asked == ViewBox(south: 40.5, west: -89.5, north: 42.5, east: -87.5))
        // A pinch within the level and the box asks nothing.
        #expect(!fetch.wants(ViewBox(south: 41.1, west: -88.9, north: 41.9, east: -88.1), zoom: 8.9))
        // A new level, or a pan past the box, does.
        #expect(fetch.wants(view, zoom: 9.0))
        #expect(fetch.wants(ViewBox(south: 42, west: -89, north: 43, east: -88), zoom: 8.2))
    }

    // MARK: Runways

    @Test func aRunwayIsDrawnBetweenItsTwoPlacedEnds() throws {
        let end = { (ident: String, lat: Double?, heading: Double?) in
            RunwayEnd(headingTrueDeg: heading, ident: ident, lat: lat, lon: lat == nil ? nil : -87.9, traffic: "left")
        }
        let runways = [
            Runway(closed: false, ends: "10L/28R", lengthFt: 13000, lighted: true,
                   runwayEnds: [end("10L", 41.98, 88.5), end("28R", 41.97, 268.5)], surface: "CONC", turf: nil, widthFt: 150, wind: nil),
            // A helipad, and a runway whose end the data does not place.
            Runway(closed: false, ends: "H1", lengthFt: 60, lighted: false, runwayEnds: [end("H1", 41.9, nil)], surface: nil, turf: nil, widthFt: 60, wind: nil),
            Runway(closed: false, ends: "4/22", lengthFt: 3000, lighted: false,
                   runwayEnds: [end("4", 41.9, 40), end("22", nil, 220)], surface: "TURF", turf: nil, widthFt: nil, wind: nil),
        ]
        let shapes = RunwayShape.of(runways)
        #expect(shapes.count == 1)
        #expect(shapes.first?.a.ident == "10L" && shapes.first?.b.ident == "28R" && shapes.first?.widthFt == 150)
    }

    @Test func aTurfRunwayIsDrawnSoftAndAConcreteOneHard() throws {
        // The engine's reading of the surface (gonogo_soft_surface), not
        // the app's: turf olive, concrete and asphalt the dark grey.
        let ends = [RunwayEnd(headingTrueDeg: 90, ident: "9", lat: 42.32, lon: -88.08, traffic: "left"),
                    RunwayEnd(headingTrueDeg: 270, ident: "27", lat: 42.32, lon: -88.07, traffic: "left")]
        let runway = { (surface: String?) in
            Runway(closed: false, ends: "9/27", lengthFt: 2400, lighted: false, runwayEnds: ends, surface: surface, turf: nil, widthFt: 100, wind: nil)
        }
        let shapes = RunwayShape.of([runway("TURF"), runway("ASPH"), runway("CONC"), runway(nil)])
        #expect(shapes.map(\.soft) == [true, false, false, false])
        let a = CLLocationCoordinate2D(latitude: 42.32, longitude: -88.08), b = CLLocationCoordinate2D(latitude: 42.32, longitude: -88.07)
        #expect(RunwaySurface.between(a, b, widthFt: 100, soft: true).soft == true)
        #expect(RunwaySurface.between(a, b, widthFt: 100).soft == false)
    }

    // MARK: Where the map opens

    @Test func theMapOpensInTheMiddleOfWhatTheSheetLeaves() throws {
        // An iPhone 852 points tall, 59 under the status bar, the sheet at
        // half way covering 426: the point at 242.5 from the top, the
        // map's middle 183.5 below it.
        #expect(MapOpening.middle(height: 852, top: 59, bottomInset: 426) == 242.5)
        #expect(MapOpening.drop(height: 852, top: 59, bottomInset: 426) == 183.5)
        // Beside the sidebar, no sheet: just under the status bar's share.
        #expect(MapOpening.drop(height: 852, top: 0, bottomInset: 0) == 0)
    }

    @Test func theOpeningZoomIsTheWebMaps() throws {
        #expect(MapOpening.zoom == 8)
        let span = MapOpening.longitudeDelta(zoom: 8, width: 393)
        #expect(abs(MapExtras.zoom(longitudeDelta: span, width: 393) - 8) < 1e-9)
    }

    @Test func theLastPositionIsKeptForTheNextOpening() throws {
        let defaults = try #require(UserDefaults(suiteName: "map-look-\(UUID().uuidString)"))
        #expect(MapOpening.remembered(defaults) == nil)
        MapOpening.remember(CLLocationCoordinate2D(latitude: 46.84, longitude: -92.19), defaults)
        let kept = try #require(MapOpening.remembered(defaults))
        #expect(kept.latitude == 46.84 && kept.longitude == -92.19)
    }
}
