import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// The fields with no planner (the offline audit, 2026-11-10): Nearest and
/// the emergency assistant from the cycle packs kept on the phone, ranked
/// by the engine's best_fields, and nothing when no pack is kept.
@MainActor
struct OfflineFieldsTests {
    /// Two fields near Duluth as the packs give them: no elevation, runway or weather.
    private let pins: PackFields.Pins = { _, _, _, _ in
        [AirportPin(ident: "KDYT", kind: "small_airport", lat: 46.722, lon: -92.043, name: "Sky Harbor", towered: false),
         AirportPin(ident: "KDLH", kind: "large_airport", lat: 46.842, lon: -92.194, name: "Duluth Intl", towered: true)]
    }
    private let noPack: PackFields.Pins = { _, _, _, _ in nil }

    private var fix: OwnShip.Fix {
        OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 46.80, longitude: -92.22), altitudeFt: 5500, trackDeg: 90,
                    groundspeedKt: 105, accuracyM: 5, at: Date(timeIntervalSince1970: 1_762_700_000))
    }

    @Test func nearestFromThePacksIsTheEnginesNearestFirst() throws {
        let fields = try #require(try PackFields.nearest(lat: 46.80, lon: -92.22, limit: 10, pins: pins))
        #expect(fields.map(\.ident) == ["KDLH", "KDYT"])
        #expect(fields.allSatisfy { $0.flightCategory == nil && $0.distanceNm > 0 })
        #expect(fields[0].kind == "large_airport" && fields[0].towered == true)
        #expect(try PackFields.nearest(lat: 46.80, lon: -92.22, limit: 10, pins: noPack) == nil)
    }

    @Test func theEmergencyFieldsComeFromThePacksWithTheEnginesDistances() throws {
        let kept = try #require(try Emergency.deviceFields(fix: fix, aircraft: nil, glideRatio: nil, pins: pins))
        #expect(kept.fields.map(\.ident) == ["KDLH", "KDYT"])
        // No weather, runways or elevation: the packs hold none.
        #expect(kept.fields.allSatisfy { $0.metar == nil && $0.runways.isEmpty && $0.elevationFt == nil })
        #expect(kept.airplane == nil && kept.wind == nil)
        // No airplane: no glide is guessed, and the engine says so.
        let ranked = try Emergency.bestFields(kept, fix: fix, variationDeg: nil)
        #expect(ranked.needsAirplane)
        #expect(try Emergency.deviceFields(fix: fix, aircraft: nil, glideRatio: nil, pins: noPack) == nil)
    }

    @Test func thePilotsOwnGlideRatioGoesWithThePacksFields() throws {
        let kept = try #require(try Emergency.deviceFields(fix: fix, aircraft: "own", glideRatio: 9, pins: pins))
        #expect(kept.airplane?.glide?.ratio == 9 && kept.airplane?.glide?.bestGlideKias == nil)
        // A ratio with no airplane picked is not used: never another's.
        #expect(try Emergency.deviceFields(fix: fix, aircraft: nil, glideRatio: 9, pins: pins)?.airplane == nil)
    }
}
