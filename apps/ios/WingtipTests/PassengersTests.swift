import Foundation
import Testing
@testable import Wingtip

/// The passenger briefing's items and sources, the flight in a few lines
/// it sends (PassengerBriefing), and its ticks (PassengerBriefingModel).
@MainActor
struct PassengersTests {
    @Test func theItemsInTheSafetyOrderWithTheirSources() throws {
        #expect(PassengerBriefing.items.map(\.key) == ["pax-belts", "pax-fastened", "pax-air", "pax-fire", "pax-exits", "pax-traffic", "pax-questions"])
        #expect(PassengerBriefing.items[0].source == "14 CFR 91.107(a)(1)")
        #expect(PassengerBriefing.items[1].source == "14 CFR 91.107(a)(2), (3)")
        #expect(PassengerBriefing.items[4].source.contains("PA.II.B.S2"))
        #expect(PassengerBriefing.items.dropFirst(2).allSatisfy { $0.source.contains("FAA Safety Briefing") })
    }

    @Test func theFlightInAFewLines() throws {
        let central = try #require(TimeZone(identifier: "America/Chicago"))
        // 14:05 UTC is 08:05 in Chicago in November (CST, UTC-6).
        let departs = try #require(ISO8601DateFormatter().date(from: "2026-11-09T14:05:00Z"))
        let message = PassengerBriefing.message(dep: "KDLH", depName: "Duluth Intl", dest: "KPWK", destName: "Chicago Executive",
                                                departs: departs, eteMin: 125.4, weather: "VFR, no ceiling, 10 sm", zone: central)
        #expect(message == """
        Duluth Intl (KDLH) to Chicago Executive (KPWK)
        Leaving 08:05 (1405Z), about 2h 5m in the air, landing about 10:10.
        Weather at KPWK now: VFR, no ceiling, 10 sm.
        """)
        // No time set and no report: what is known, no more.
        #expect(PassengerBriefing.message(dep: "KDLH", depName: nil, dest: "KHIB", destName: nil, departs: nil, eteMin: 40, weather: nil)
            == "KDLH to KHIB\nAbout 40m in the air.")
    }

    @Test func theDestinationsWeatherInWords() throws {
        #expect(PassengerBriefing.weather(nil) == nil)
        let metar = Metar(ceilingFt: 2500, flightCategory: "MVFR", visibilitySm: 5)
        #expect(PassengerBriefing.weather(metar) == "MVFR, ceiling 2,500 ft, 5 sm")
    }

    @Test func ticksAreKeptForTheFlight() throws {
        let d = try #require(UserDefaults(suiteName: "wingtip-passengers-\(UUID().uuidString)"))
        let day = try #require(ISO8601DateFormatter().date(from: "2026-11-09T18:00:00Z"))
        let flight = PassengerBriefingModel.flight(idents: ["KDLH", "KPWK"], on: day)
        #expect(flight.hasPrefix("KDLH-KPWK|"))
        let model = PassengerBriefingModel(flight: flight, defaults: d)
        #expect(model.done == 0)
        model.toggle("pax-belts")
        model.toggle("pax-fire")
        model.toggle("pax-fire")
        #expect(model.done == 1 && model.isTicked("pax-belts"))
        #expect(PassengerBriefingModel(flight: flight, defaults: d).isTicked("pax-belts"))
        #expect(PassengerBriefingModel(flight: "KDLH-KHIB|2026-11-09", defaults: d).done == 0)
        let at = try #require(ISO8601DateFormatter().date(from: "2026-11-09T14:01:10Z"))
        #expect(PassengerBriefingModel.nextQuarterHour(after: at) == ISO8601DateFormatter().date(from: "2026-11-09T14:15:00Z"))
    }
}
