import CoreLocation
import Testing
@testable import Wingtip

/// What the app says where a figure, a yes or no or a list couldn't be
/// had: unknown said as unknown, never a made-up value in its place
/// (the audit's `try? … ?? default`, 2026-11-10).
@MainActor
struct NoSilentDefaultsTests {
    @Test func densityAltitudeIsNothingWithoutItsInputsAndTheEnginesWithThem() throws {
        #expect(FieldDensity.altitudeFt(elevationFt: nil, altimeterInHg: 29.92, tempC: 15) == nil)
        // A standard day at sea level: the density altitude is the field's
        // own, near 0 ft (FAA-H-8083-25C ch. 4).
        let standard = try #require(FieldDensity.altitudeFt(elevationFt: 0, altimeterInHg: 29.92, tempC: 15)).get()
        #expect(abs(standard) < 100)
        // Hot and high reads higher than the field.
        let hot = try #require(FieldDensity.altitudeFt(elevationFt: 5000, altimeterInHg: 29.92, tempC: 35)).get()
        #expect(hot > 8000)
    }

    @Test func theDrillPicksNoAltitudeOfItsOwn() {
        let model = DiversionDrillModel()
        // Neither a plan nor a fix: none picked for the pilot.
        model.startingAltitude(planFt: nil, fix: nil)
        #expect(model.altitudeFt == nil)
        // The plan's cruise, as the nearest of the engine's VFR altitudes.
        model.startingAltitude(planFt: 5500, fix: nil)
        #expect(model.altitudeFt == 5500)
    }

    @Test func aWindTheEngineCouldNotReadIsSaidSo() {
        let report = FieldWeatherMarks.Report(ident: "KJVL", category: "VFR", windDirTrueDeg: 220, windSpeedKt: 12)
        #expect(FieldWeatherMarks.spoken(report, calm: false, red: false, worse: false, windUnknown: true)
            == "VFR, wind couldn't be worked out from the report")
        #expect(FieldWeatherMarks.spoken(report, calm: false, red: false, worse: false).contains("wind 220 at 12"))
    }

    @Test func distanceIsThrownNotDroppedAndNoneOnTheDeparturesOwnCard() throws {
        let madison = CourseEnd(airspaceClass: "C", elevationFt: 887, ident: "KMSN", kind: nil, lat: 43.1399, lon: -89.3375, name: "Dane County Regional",
                                patternAltitudeFt: nil)
        #expect(try AirportDistance.of(lat: madison.lat, lon: madison.lon, ident: "KMSN", fix: nil, departure: madison) == nil)
        let nm = try Flight.distanceNm(CLLocationCoordinate2D(latitude: 43.1399, longitude: -89.3375), CLLocationCoordinate2D(latitude: 43.9844, longitude: -88.5570))
        #expect((60...64).contains(nm))
    }

    @Test func theEmergencyGuidanceIsAListOrAProblemNeverAnEmptyList() throws {
        let items = try #require(try Emergency.guidance(airplaneChosen: false))
        #expect(!items.isEmpty)
    }
}
