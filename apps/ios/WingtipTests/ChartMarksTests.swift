import Foundation
import MapKit
import Testing
@testable import Wingtip
import WingtipEngine

private final class MarksBundle {}

/// The special-use areas and fixes on the map (ChartMarks): the engine's
/// answer read, each area inked by its kind, its hatch on the area's side,
/// and the packs asked through the engine's C entry points.
@MainActor
struct ChartMarksTests {
    /// The engine's special_use_in_view as it writes an answer.
    static let answer = #"{"areas":[{"type":"MOA","name":"Ash","floor_ft":500,"ceiling_ft":null,"rings":[[[41.5,-88.5],[41.5,-87.5],[42.5,-87.5],[42.5,-88.5],[41.5,-88.5]]],"label":[42,-88]},{"type":"R","name":"R-1","floor_ft":0,"ceiling_ft":9000,"rings":[[[42,-88],[42,-87],[43,-87],[43,-88],[42,-88]]],"label":[42.5,-87.5]}]}"#

    @Test func theAreasAreReadAndInkedByTheirKind() throws {
        let areas = try Planner.snakeCase.decode(CyclePacks.AreasAnswer.self, from: Data(Self.answer.utf8)).areas
        #expect(areas.map(\.name) == ["Ash", "R-1"] && areas[0].floorFt == 500 && areas[0].ceilingFt == nil)
        #expect(areas.map(\.restricted) == [false, true])
        let lines = try areas.map { try #require(SpecialUseLine.of($0.rings[0], restricted: $0.restricted)) }
        #expect(lines[0].ink == WingtipColor.Chart.airspaceMagenta && lines[1].ink == WingtipColor.Chart.specialUse)
        #expect(lines[1].pointCount == 5 && lines[1].coordinate.latitude > 42)
        #expect(SpecialUseLine.of([[42, -88], [42, -87]], restricted: true) == nil)
    }

    @Test func theHatchIsOnTheAreasSide() {
        // The engine's rings run with the area on their left in lon/lat:
        // east along the south edge, the area to the north, which is up the
        // screen (map points' y runs south).
        let east = SpecialUseRenderer.inside(dx: 10, dy: 0)
        #expect(east.x == 0 && east.y == -1)
        // North along the east edge, the area to the west.
        let north = SpecialUseRenderer.inside(dx: 0, dy: -10)
        #expect(north.x == -1 && north.y == 0)
        #expect(SpecialUseRenderer.inside(dx: 0, dy: 0) == (0, 0))
    }

    @Test func thePacksAreAskedThroughTheEngine() throws {
        let packs = try ["n40w088", "n40w092"].map { name -> String in
            try #require(Bundle(for: MarksBundle.self).url(forResource: name, withExtension: "pack")).path
        }
        // The Chicago cut holds no sua sections or fixes table: none, not a failure.
        let areas = CyclePacks.inView(CyclePacks.AreasAnswer.self, packs: packs, south: 41.5, west: -88.5, north: 42.5, east: -87.5, WingtipEngine.specialUseInView)
        #expect(areas?.areas == [])
        let fixes = CyclePacks.inView(CyclePacks.FixesAnswer.self, packs: packs, south: 41.5, west: -88.5, north: 42.5, east: -87.5, WingtipEngine.fixesInView)
        #expect(fixes?.fixes == [])
    }
}
