import Foundation
import Testing
@testable import Wingtip

/// A server that ships before the app: an answer with a field this build
/// has no property for and an enum value it has never seen still decodes
/// through the planner's decoder, the new value kept as the string the
/// server sent (scripts/build/api-models-apps.sh).
struct ApiToleranceTests {
    @Test func anUnknownFieldAndAnUnknownEnumValueDecode() throws {
        // "hail" is no RouteBand kind of the planner's document (vfr, mvfr,
        // ifr, storm) and "severity" no field of it.
        let json = #"{"kind":"hail","min":12.5,"severity":{"level":3}}"#
        let band = try Planner.json.decode(APIRouteBand.self, from: Data(json.utf8))
        #expect(band.kind == "hail")
        #expect(band.min == 12.5)
    }
}
