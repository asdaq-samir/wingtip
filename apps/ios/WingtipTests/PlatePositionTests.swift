import CoreLocation
import Foundation
import Testing
import UIKit
@testable import Wingtip

/// Own ship on a plate full screen (PlatePosition): the planner's
/// georeference handed to the engine's plate_page_point unchanged, held to
/// the shared fixture the engine (engine/facade/tests/plate_page_point.rs)
/// and the web (features/plates/platePosition.test.ts) hold it to, KRFD
/// ILS RWY 07's; and nothing drawn with no fix, no georeference or off
/// the plan view.
@MainActor
struct PlatePositionTests {
    private struct Case: Decodable {
        struct Input: Decodable {
            let lat: Double
            let lon: Double
            let track_deg: Double?
        }
        struct Expected: Decodable {
            let x: Double
            let y: Double
            let rotation_deg: Double?
        }
        let why: String
        let input: Input
        let expected: Expected?
    }

    private struct Fixture: Decodable {
        let georeference: APIPlateGeoreference
        let cases: [Case]
    }

    private func fixture() throws -> Fixture {
        let url = try #require(Bundle(for: PositionFixtureAnchor.self).url(forResource: "platePagePoint", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    /// A fix at the point, flying at 120 kt so the engine calls it underway.
    private func fix(_ lat: Double, _ lon: Double, track: Double?, speed: Double = 120) -> OwnShip.Fix {
        OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), altitudeFt: 2000, trackDeg: track,
                    groundspeedKt: speed, accuracyM: 5, at: Date(timeIntervalSince1970: 1_762_700_000))
    }

    @Test func eachFixtureCaseLandsWhereTheEngineSays() throws {
        let fixture = try fixture()
        for c in fixture.cases {
            let mark = PlatePosition.mark(fix(c.input.lat, c.input.lon, track: c.input.track_deg), georeference: fixture.georeference)
            guard let want = c.expected else {
                #expect(mark == nil, "\(c.why)")
                continue
            }
            let got = try #require(mark, "\(c.why)")
            // The fixture's figures are to six places, its turn to four.
            #expect(abs(got.x - want.x) < 1e-5, "\(c.why)")
            #expect(abs(got.y - want.y) < 1e-5, "\(c.why)")
            if let turn = want.rotation_deg {
                #expect(abs((got.rotationDeg ?? .nan) - turn) < 1e-3, "\(c.why)")
            } else {
                #expect(got.rotationDeg == nil, "\(c.why)")
            }
        }
    }

    @Test func nothingIsDrawnWithNoFixOrNoGeoreference() throws {
        let fixture = try fixture()
        #expect(PlatePosition.mark(nil, georeference: fixture.georeference) == nil, "own ship off")
        #expect(PlatePosition.mark(fix(42.2, -89.1, track: 90), georeference: nil) == nil, "a plate whose page is not placed")
    }

    @Test func aStillAirplaneIsADotNotAnArrow() throws {
        let fixture = try fixture()
        let still = try #require(PlatePosition.mark(fix(42.2, -89.1, track: nil, speed: 0), georeference: fixture.georeference))
        #expect(!still.moving)
        let flying = try #require(PlatePosition.mark(fix(42.2, -89.1, track: 90), georeference: fixture.georeference))
        #expect(flying.moving)
    }

    @Test func theMarkSitsAtItsFractionOfTheFirstPageAndKeepsItsSize() throws {
        let view = PagesScrollView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        view.images = [UIGraphicsImageRenderer(size: CGSize(width: 396, height: 612)).image { _ in }]
        view.mark = PageMark(x: 0.5, y: 0.25, rotationDeg: 90, moving: true)
        view.layoutIfNeeded()
        let ownShip = try #require(view.subviews.flatMap(\.subviews).first(where: { $0 is PageOwnShipView }))
        #expect(abs(ownShip.center.x - 200) < 0.5)
        #expect(abs(ownShip.center.y - 400 * 612 / 396 * 0.25) < 0.5)
        view.mark = nil
        #expect(ownShip.superview == nil, "no mark, no airplane")
    }
}

/// The test bundle, where the shared fixtures are its resources.
private final class PositionFixtureAnchor {}
