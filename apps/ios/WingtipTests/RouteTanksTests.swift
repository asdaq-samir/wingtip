import Foundation
import Testing
@testable import Wingtip

/// FPL's fuel gauges (RouteTanks): the engine's fuel_in_tanks walked over
/// the nav log's legs, a stop fuelled again, the pilot's own figure, and
/// Add Fuel Stops' route.
@MainActor
struct RouteTanksTests {
    private let figures = RouteTanks.Figures(usableGal: 40, taxiGal: 1.4, reservesGal: [6, 6])
    private let legs: [RouteTanks.LegBurn] = [.init(to: "WP1", fuelGal: 4), .init(to: "KJVL", fuelGal: 6), .init(to: "KOSH", fuelGal: 9)]

    @Test func fullTanksAtTheStartEachLegBurntAndAStopFuelledAgain() throws {
        let tanks = try RouteTanks.walk(legs: legs, dep: "C81", stops: ["KJVL"], refuels: [true], figures: figures, own: [:])
        let start = try #require(tanks[.departure]), stop = try #require(tanks[.stop(0)]), end = try #require(tanks[.destination])
        #expect(start.gal == 40 && start.own == nil && !start.low)
        // Landed at KJVL with the start's less the allowance and two legs.
        #expect(stop.gal < start.gal - 10 + 0.001)
        // Fuelled full there, so the destination's is the full tanks less
        // the allowance and the last leg alone, more than if not fuelled.
        let unfuelled = try RouteTanks.walk(legs: legs, dep: "C81", stops: ["KJVL"], refuels: [false], figures: figures, own: [:])
        #expect(end.gal > (unfuelled[.destination]?.gal ?? .infinity))
        #expect(end.gal <= 40 - 9 + 0.001)
    }

    @Test func thePilotsOwnFuelAtTheStartAndNoneBoughtAtAStop() throws {
        let own = try RouteTanks.walk(legs: legs, dep: "C81", stops: ["KJVL"], refuels: [true], figures: figures, own: ["C81": 20, "KJVL": 0])
        #expect(own[.departure]?.gal == 20 && own[.departure]?.own == 20)
        // No fuel bought keeps what it landed with.
        let stop = try #require(own[.stop(0)]), end = try #require(own[.destination])
        #expect(stop.own == 0 && end.gal < stop.gal)
    }

    @Test func pastEmptyTheGallonsShortUnderTheReserve() throws {
        let long: [RouteTanks.LegBurn] = [.init(to: "KOSH", fuelGal: 50)]
        let tanks = try RouteTanks.walk(legs: long, dep: "C81", stops: [], refuels: [], figures: figures, own: [:])
        let end = try #require(tanks[.destination])
        #expect(end.gal < 0 && end.low)
        #expect(Format.tankGallons(end.gal).== "\(-Int(end.gal.rounded(.down))) gal short")
    }

    @Test func aStopNoLegEndsAtShowsNoGaugesRatherThanWrongOnes() throws {
        let tanks = try RouteTanks.walk(legs: legs, dep: "C81", stops: ["KMSN"], refuels: [true], figures: figures, own: [:])
        #expect(tanks.isEmpty)
        #expect(try RouteTanks.walk(legs: legs, dep: "C81", stops: [], refuels: [], figures: nil, own: [:]).isEmpty)
    }

    @Test func theGaugesWords() {
        #expect(Format.tankGallons(23.9) == "23 gal")
        #expect(Format.tankGallons(-11.2) == "12 gal short")
        #expect(Format.tankGallons(0) == "0 gal")
        #expect(!Format.tankGallons(-30.5).contains("\u{2212}"))
    }

    @Test func everyFlightsFuelStopsGoInAfterItsOwnDeparture() throws {
        let json = #"""
        [{"departure":"KLAS","destination":"KSLC","reason":"fuel","usable_gal":40,"stops":[{"ident":"KCDC","lat":37.7,"lon":-113.1,"added_nm":4,"city":"","from_nm":100,"fuel_types":"100LL","lands_with_gal":12,"minutes":60,"name":"KCDC","runway_ft":5000}]},
         {"departure":"KSLC","destination":"KPWK","reason":"fuel","usable_gal":40,"stops":[{"ident":"KRKS","lat":41.6,"lon":-109.1,"added_nm":4,"city":"","from_nm":100,"fuel_types":"100LL","lands_with_gal":12,"minutes":60,"name":"KRKS","runway_ft":5000}]},
         {"departure":"KLAS","destination":"KPWK","reason":"break","usable_gal":40,"stops":[{"ident":"KBTF","lat":40.9,"lon":-111.9,"added_nm":4,"city":"","from_nm":100,"fuel_types":"100LL","lands_with_gal":12,"minutes":60,"name":"KBTF","runway_ft":5000}]}]
        """#
        let suggested = try Planner.json.decode([FuelStopSuggestion].self, from: Data(json.utf8))
        let next = try #require(RouteTanks.withFuelStops(dep: "KLAS", stops: ["KSLC"], suggested: suggested))
        #expect(next.stops == ["KCDC", "KSLC", "KRKS"])
        #expect(next.added == ["KCDC", "KRKS"])
        // Already in: nothing more to put in.
        #expect(RouteTanks.withFuelStops(dep: "KLAS", stops: next.stops, suggested: suggested) == nil)
    }

    @Test func eachFlightIsHeldToItsOwnReserve() throws {
        // The first flight's reserve is the night's 45 minutes, the second's
        // the day's 30 (14 CFR 91.151(a)): landing at KJVL with 8 gal is low
        // against 9, the destination with 8 is not against 5.
        let burns: [RouteTanks.LegBurn] = [.init(to: "KJVL", fuelGal: 30.6), .init(to: "KOSH", fuelGal: 30.6)]
        let held = RouteTanks.Figures(usableGal: 40, taxiGal: 1.4, reservesGal: [9, 5])
        let tanks = try RouteTanks.walk(legs: burns, dep: "C81", stops: ["KJVL"], refuels: [true], figures: held, own: [:])
        #expect(tanks[.stop(0)]?.low == true)
        #expect(tanks[.destination]?.low == false)
    }

    @Test func aFlightShortWithNoStopSaysWhy() throws {
        let json = #"[{"departure":"C81","destination":"KDLH","on_board":true},{"departure":"KMSN","destination":"KDLH"}]"#
        let short = try Planner.json.decode([NoFuelStop].self, from: Data(json.utf8))
        #expect(RouteTanks.noFuelStopWords(short) == "Too little fuel on board for C81 → KDLH")
        #expect(RouteTanks.noFuelStopWords(Array(short.dropFirst())) == "No fuel stop in reach on KMSN → KDLH")
        #expect(RouteTanks.noFuelStopWords([]) == nil)
    }
}
