import Foundation
import Testing
@testable import Wingtip

/// A route typed or pasted whole (TypedRoute, FPL's Type Route): read by
/// the engine's route_read as item 15 of FAA Form 7233-4 has it, the
/// first point left from, the last landed at, the cruise from a level
/// group, and the field filled with the route as it is.
struct TypedRouteTests {
    @Test func aFiledRouteIsItsPointsInOrder() throws {
        let read = try #require(try TypedRoute.read("kpwk dct obk v100 klas"))
        #expect(read.dep == "KPWK")
        #expect(read.dest == "KLAS")
        #expect(read.stops == ["OBK", "V100"])
        #expect(read.cruiseFt == nil)
    }

    @Test func aLevelGroupIsTheCruise() throws {
        let read = try #require(try TypedRoute.read("N0110A065 KMSN KOSH"))
        #expect(read.dep == "KMSN")
        #expect(read.dest == "KOSH")
        #expect(read.stops.isEmpty)
        #expect(read.cruiseFt == 6500)
    }

    @Test func aPositionIsKeptWhole() throws {
        let read = try #require(try TypedRoute.read("@42.3246,-88.0741 KMSN"))
        #expect(read.dep == "@42.3246,-88.0741")
        #expect(read.dest == "KMSN")
    }

    @Test func onePointIsNoRoute() throws {
        #expect(try TypedRoute.read("KMSN") == nil)
        #expect(try TypedRoute.read("   ") == nil)
    }

    @Test func theFieldStartsWithTheRouteAsItIs() {
        #expect(TypedRoute.words(dep: "C81", stops: ["KJVL"], dest: "KMSN") == "C81 KJVL KMSN")
        #expect(TypedRoute.words(dep: "", stops: [], dest: "KMSN") == "KMSN")
    }
}
