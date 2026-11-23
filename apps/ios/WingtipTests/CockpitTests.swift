import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// The iPad cockpit's own (the market-gap report's items 4, 5, 8 and 9;
/// the owner, 2026-11-21: "Primary app users are on iPad"): the chart
/// beside the map, the scratchpad, the weight and balance graph and the
/// runway proximity advisor. The rules are the engine's; these hold the
/// models to asking it and keeping what the pilot made.
@MainActor
struct CockpitTests {
    /// A runway 9-27 laid east and west at 40° N, 100 ft wide, at a field
    /// 1,000 ft high (the engine's own proximity tests' runway).
    private func field() -> AirportPlace {
        let runway = Runway(closed: false, ends: "09/27", lengthFt: 5586, lighted: true,
                            runwayEnds: [RunwayEnd(ident: "09", lat: 40, lon: -90.01), RunwayEnd(ident: "27", lat: 40, lon: -89.99)],
                            surface: "ASPH", widthFt: 100)
        var place = AirportPlace(frequencies: [], ident: "KTST", kind: "small_airport", lat: 40, lon: -90, name: "Test Field", runways: [runway], towered: false)
        place.elevationFt = 1000
        return place
    }

    private func fix(lat: Double = 40, lon: Double = -90, track: Double? = 270, kt: Double? = 40, age: TimeInterval = 0.5) -> OwnShip.Fix {
        OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon), altitudeFt: 1005, trackDeg: track,
                    groundspeedKt: kt, accuracyM: 5, at: Date(timeIntervalSinceNow: -age))
    }

    /// Rolling west down the runway's middle: on runway 27, in the
    /// warning's colour; a fix four seconds old says nothing (AC 120-76D
    /// 11.17.2.3, the engine's).
    @Test func onTheRunwayTheAdvisorSaysItsEnd() throws {
        let advisor = RunwayAdvisor(place: field())
        advisor.speaks = false
        advisor.hear(fix(), hotSpots: [])
        #expect(advisor.answer?.state == "on_runway")
        #expect(advisor.lines?.shown == "On runway 27")
        #expect(advisor.urgent)
        advisor.hear(fix(age: 4), hotSpots: [])
        #expect(advisor.answer?.state == "no_fix" && advisor.lines == nil)
        advisor.hear(nil, hotSpots: [])
        #expect(advisor.answer == nil)
    }

    /// Northbound 400 ft south of the runway at 10 kt: approaching it, the
    /// sign's order (9-27) and the hold short line's distance under it.
    @Test func approachingTheRunwaySaysTheLine() throws {
        let advisor = RunwayAdvisor(place: field())
        advisor.speaks = false
        advisor.hear(fix(lat: 39.998903, track: 0, kt: 10), hotSpots: [])
        #expect(advisor.lines?.shown == "Approaching runway 9-27")
        #expect(advisor.lines?.detail?.hasPrefix("Hold short line in about") == true)
    }

    /// The field's own pattern height is passed only where the FAA
    /// publishes it; else the engine takes AC 90-66C's.
    @Test func thePatternHeightIsTheFieldsOwnOnly() {
        var place = field()
        place.pattern = .init(aglFt: 800, published: false)
        #expect(RunwayAdvisor.Field(place).patternAglFt == nil)
        place.pattern = .init(aglFt: 800, published: true)
        #expect(RunwayAdvisor.Field(place).patternAglFt == 800)
        #expect(RunwayAdvisor.Field(place).runways.first?.runwayEnds?.count == 2)
    }

    /// Pages kept with the flight: written, read back for the same route,
    /// none for another; deleted, the file gone.
    @Test func scratchpadPagesAreKeptWithTheFlight() {
        let route = "KTST KOSH \(UUID().uuidString)"
        let model = ScratchpadModel()
        model.open(flight: route)
        model.add(.craft)
        model.setField("c", "KOSH")
        model.add(.blank)
        let again = ScratchpadModel()
        again.open(flight: route)
        #expect(again.pages.map(\.template) == [.craft, .blank])
        #expect(again.pages.first?.fields["c"] == "KOSH")
        #expect(again.name(again.pages[0]) == "1 · Clearance (CRAFT)")
        let other = ScratchpadModel()
        other.open(flight: route + " KMSN")
        #expect(other.pages.isEmpty)
        again.deleteShown()
        again.deleteShown()
        #expect(!FileManager.default.fileExists(atPath: ScratchStore.file(route).path))
    }

    /// The forms' lines: CRAFT in its order, the ATIS's five.
    @Test func theFormsHaveTheirLines() {
        #expect(ScratchTemplate.craft.lines.map(\.label) == ["Cleared to", "Route", "Altitude", "Frequency", "Transponder"])
        #expect(ScratchTemplate.atis.lines.map(\.key) == ["information", "wind", "altimeter", "runway", "remarks"])
        #expect(ScratchTemplate.blank.lines.isEmpty)
    }

    /// A test loading (not an airplane's): 1,500 lb at 39 in empty, 340 lb
    /// at 37 in, 40 gal at 48 in and 6 lb a gallon, no start and taxi fuel.
    private func loading(maxTakeoff: Double = 2300) -> PohLoading {
        PohLoading(envelope: [[35, 1500], [35, 1950], [41, 2300], [47.3, 2300], [47.3, 1500]], fuelArmIn: 48, fuelLbPerGal: 6,
                   fuelMaxGal: 53, maxLandingLb: 2300, maxRampLb: 2307, maxTakeoffLb: maxTakeoff, sampleEmptyMomentLbIn: 58500,
                   sampleEmptyWeightLb: 1500, source: "test", startTaxiFuelLb: 0, stations: [LoadingStation(armIn: 37, name: "Front seats")])
    }

    /// Weighed on the device by the engine: 1,500 + 340 + 240 lb is 2,080
    /// lb, its moment 58,500 + 12,580 + 11,520 lb-in, 39.71 in; ten gallons
    /// burnt, 2,020 lb at 39.47 in. Over the most it may weigh, a problem.
    @Test func theLoadingIsWeighedAndDrawn() throws {
        let load = AirplaneLoad(emptyArmIn: 39, emptyWeightLb: 1500, fuelGal: 40, stationsLb: [340])
        let model = LoadingModel()
        model.weigh(loading(), load: load, tripFuelGal: 10)
        let balance = try #require(model.balance)
        #expect(balance.takeoff.weightLb == 2080)
        #expect(abs((balance.takeoff.armIn ?? 0) - 82600.0 / 2080) < 0.001)
        #expect(abs((balance.landing.armIn ?? 0) - 79720.0 / 2020) < 0.001)
        #expect(balance.problems.isEmpty)
        let outline = LoadingModel.outline(loading())
        #expect(outline.count == 6 && outline.first?.armIn == outline.last?.armIn)
        let room = try #require(LoadingModel.domains(outline))
        #expect(room.arm == 34...49 && room.weight == 1400...2400)
        model.weigh(loading(maxTakeoff: 2000), load: load, tripFuelGal: 10)
        #expect(model.balance?.problems.isEmpty == false)
        // Jet A picked: the engine weighs the 40 gal at its 6.8 lb a
        // gallon (gonogo_balance), 32 lb more than the POH's 6.0.
        model.weigh(loading(), load: load, tripFuelGal: 10, grade: "jet_a")
        #expect(abs((model.balance?.takeoff.weightLb ?? 0) - 2112) < 0.001)
    }

    /// The chart beside the map: one at a time, put away by its close.
    @Test func aChartStandsBesideTheMap() {
        let nav = Navigator()
        let plate = PictureRequest(title: "ILS RWY 36", source: .faaChart(url: "https://aeronav.faa.gov/d-tpp/2611/00123IL36.PDF", airport: "KOSH"))
        nav.beside = plate
        nav.open(.airport("KOSH"))
        #expect(nav.beside == plate)
        nav.beside = nil
        #expect(nav.beside == nil)
        #expect(BesideShare.allCases.map(\.fraction) == [1.0 / 3.0, 0.5, 2.0 / 3.0])
        #expect(SheetPage(stored: "+scratchpad") == .scratchpad && SheetPage.scratchpad.inspects)
    }
}
