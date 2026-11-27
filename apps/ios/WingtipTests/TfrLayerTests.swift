import Foundation
import MapKit
import Testing
@testable import Wingtip

/// The TFRs on the map (TfrLayer): each area from its GeoJSON, a
/// MultiPolygon's parts each an area, the NOTAM number on the first
/// area's northern edge, and in force where the engine cannot say.
@MainActor
struct TfrLayerTests {
    private func tfr(_ geometry: String, id: String = "6/1234") throws -> APITfr {
        let json = #"{"notam_id": "\#(id)", "geometry": \#(geometry)}"#
        return try JSONDecoder().decode(APITfr.self, from: Data(json.utf8))
    }

    @Test func eachAreaIsDrawnWithItsNumberOnItsNorthernEdge() throws {
        let square = #"{"type": "Polygon", "coordinates": [[[-88, 43], [-88, 44], [-87, 44], [-87, 43], [-88, 43]]]}"#
        let two = #"{"type": "MultiPolygon", "coordinates": [[[[-90, 40], [-90, 41], [-89, 41], [-90, 40]]], [[[-80, 30], [-80, 31], [-79, 31], [-80, 30]]]]}"#
        let shapes = TfrLayer.shapes([try tfr(square), try tfr(two, id: "6/5678")], now: Date())
        #expect(shapes.areas.count == 3)
        #expect(shapes.areas.map(\.notamId) == ["6/1234", "6/5678", "6/5678"])
        #expect(shapes.labels.map(\.notamId) == ["6/1234", "6/5678"])
        #expect(abs(shapes.labels[0].coordinate.latitude - 44) < 1e-9)
    }

    @Test func aGeometryThatDoesNotReadDrawsNothing() throws {
        #expect(TfrLayer.polygons(try tfr(#"{"type": "Point", "coordinates": [-88, 43]}"#).geometry).isEmpty)
    }
}
