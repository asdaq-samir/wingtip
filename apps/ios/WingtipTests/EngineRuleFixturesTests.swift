import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// The small rules the app asks the engine rather than keeping its own
/// copy (the airplane form's limits, traffic's notice and freshness,
/// paperwork's tone, the drills' boxes, the geodesic figures), each
/// checked against the web's shared fixture of examples as
/// SharedFixturesTests checks the rest.
private struct AircraftFormFixture: Decodable {
    struct Form: Decodable {
        let tailNumber, typeDesignator, cruiseTasKt, fuelBurnGph, cruisePowerPct, climbTasKt: String
        let climbFuelBurnGph, usableFuelGal, equipment, surveillance, colour: String
    }
    struct Case: Decodable { let form: Form; let problems: [String: String] }
    let cases: [Case]
}

private struct TrafficRulesFixture: Decodable {
    struct Place: Decodable { let lat, lon: Double }
    struct Plane: Decodable { let lat, lon: Double; let altitudeFt: Double?; let pressureAltitude: Bool? }
    struct Notice: Decodable { let own: Place?; let ownFt: Double?; let plane: Plane; let nm, bearingDeg: Double?; let near, tell: Bool }
    struct Fresh: Decodable { let ageS, seenS: Double?; let fresh: Bool }
    let notice: [Notice]
    let fresh: [Fresh]
}

private struct DueToneFixture: Decodable {
    struct Case: Decodable { let daysLeft, hoursLeft: Double?; let tone: String }
    let dueTone: [Case]
}

private struct DrillNextFixture: Decodable {
    struct Answer: Decodable { let box, inDays: Double }
    struct Case: Decodable { let box: Double?; let knew: Bool; let result: Answer }
    let next: [Case]
}

private struct GeodesicFixture: Decodable {
    struct Distance: Decodable { let lat1, lon1, lat2, lon2, nm: Double }
    struct Bearing: Decodable { let lat1, lon1, lat2, lon2, deg: Double }
    struct Place: Decodable { let lat, lon: Double }
    struct Destination: Decodable { let lat, lon, bearingDeg, nm: Double; let to: Place }
    let distance: [Distance]
    let bearing: [Bearing]
    let destination: [Destination]
}

private final class RuleFixtureBundle {}

private struct RuleFixtureMissing: Error { let name: String }

/// A shared fixture, bundled into this target by project.yml, as
/// SharedFixturesTests reads its own.
private func fixture<T: Decodable>(_ name: String, as type: T.Type, decoder: JSONDecoder = JSONDecoder()) throws -> T {
    guard let url = Bundle(for: RuleFixtureBundle.self).url(forResource: name, withExtension: "json") else { throw RuleFixtureMissing(name: name) }
    return try decoder.decode(T.self, from: Data(contentsOf: url))
}

/// Doubles as close as their arithmetic allows: the fixtures are written
/// by Python's numbers, the engine works in Rust's.
private func roughly(_ a: Double?, _ b: Double?, within: Double = 1e-9) -> Bool {
    switch (a, b) {
    case (nil, nil): return true
    case let (a?, b?): return abs(a - b) <= within
    default: return false
    }
}

private var snakeCase: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
}

@MainActor
struct EngineRuleFixturesTests {
    @Test func theAirplaneFormIsCheckedAsTheWebAndTheGatewayCheckIt() throws {
        let f = try fixture("aircraftForm", as: AircraftFormFixture.self)
        #expect(!f.cases.isEmpty)
        for c in f.cases {
            var form = AircraftForm()
            form.tailNumber = c.form.tailNumber; form.typeDesignator = c.form.typeDesignator
            form.cruiseTasKt = c.form.cruiseTasKt; form.fuelBurnGph = c.form.fuelBurnGph; form.cruisePowerPct = c.form.cruisePowerPct
            form.climbTasKt = c.form.climbTasKt; form.climbFuelBurnGph = c.form.climbFuelBurnGph; form.usableFuelGal = c.form.usableFuelGal
            form.equipment = c.form.equipment; form.surveillance = c.form.surveillance; form.colour = c.form.colour
            #expect(form.problems == c.problems, "\(c.form)")
        }
    }

    @Test func trafficIsToldAndKeptAsTheOtherAppsDo() throws {
        let f = try fixture("traffic", as: TrafficRulesFixture.self, decoder: snakeCase)
        #expect(!f.notice.isEmpty && !f.fresh.isEmpty)
        for c in f.notice {
            let plane = TrafficAircraft(altitudeFt: c.plane.altitudeFt, hex: "x", lat: c.plane.lat, lon: c.plane.lon,
                                        pressureAltitude: c.plane.pressureAltitude)
            let own = c.own.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
            let mark = try #require(try Traffic.marks([plane], ownFt: c.ownFt, own: own).first)
            #expect(mark.near == c.near && mark.tell == c.tell, "\(c.plane) against \(String(describing: c.own))")
            #expect(roughly(mark.nm, c.nm) && roughly(mark.bearingDeg, c.bearingDeg), "\(c.plane) against \(String(describing: c.own))")
        }
        for c in f.fresh {
            #expect(try Engine.trafficFresh(ageS: c.ageS, planes: [.init(seenS: c.seenS)]) == [c.fresh], "\(String(describing: c.seenS)) s in \(String(describing: c.ageS)) s")
        }
    }

    @Test func paperworkIsTonedAsTheOtherAppsTone() throws {
        let f = try fixture("records", as: DueToneFixture.self, decoder: snakeCase)
        #expect(!f.dueTone.isEmpty)
        for c in f.dueTone {
            #expect(try Engine.dueTone(daysLeft: c.daysLeft, hoursLeft: c.hoursLeft) == c.tone, "\(String(describing: c.daysLeft)) d, \(String(describing: c.hoursLeft)) h")
        }
    }

    @Test func aDrillCardMovesBoxAsTheOtherAppsMoveIt() throws {
        let f = try fixture("drills", as: DrillNextFixture.self, decoder: snakeCase)
        #expect(!f.next.isEmpty)
        for c in f.next {
            let got = try Engine.drillNext(box: c.box, knew: c.knew)
            #expect(got.box == c.result.box && got.inDays == c.result.inDays, "box \(String(describing: c.box)), knew \(c.knew)")
        }
    }

    @Test func theGeodesicIsTheOneEveryAppAsks() throws {
        let f = try fixture("geodesic", as: GeodesicFixture.self, decoder: snakeCase)
        for c in f.distance {
            #expect(roughly(try Engine.distanceNm(lat1: c.lat1, lon1: c.lon1, lat2: c.lat2, lon2: c.lon2), c.nm), "\(c)")
        }
        for c in f.bearing {
            #expect(roughly(try Engine.bearingDeg(lat1: c.lat1, lon1: c.lon1, lat2: c.lat2, lon2: c.lon2), c.deg), "\(c)")
        }
        let got = try Engine.destination(points: f.destination.map { .init(lat: $0.lat, lon: $0.lon, bearingDeg: $0.bearingDeg, nm: $0.nm) })
        #expect(got.count == f.destination.count)
        for (g, c) in zip(got, f.destination) { #expect(roughly(g.lat, c.to.lat) && roughly(g.lon, c.to.lon), "\(c)") }
    }
}
