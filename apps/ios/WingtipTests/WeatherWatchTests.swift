import Foundation
import Testing
import UserNotifications
@testable import Wingtip

/// The route's weather watched after the Brief (WeatherWatch): the
/// engine's weather_worse held to the shared fixture the engine's own
/// tests read (apps/web/src/lib/fixtures/weatherWorse.json), the briefing
/// carried into its reading, each change told once, and the pilot's
/// notification settings kept to.
@MainActor
struct WeatherWatchTests {
    private final class FixtureBundle {}

    private struct Fixture: Decodable {
        struct Case: Decodable {
            let why: String
            let input: EngineContract.WeatherWorseInput
            let keys: [String]
            let lines: [String]
        }

        let cases: [Case]
    }

    @Test func theEngineSaysWhatIsWorseAsTheFixtureHasIt() throws {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "weatherWorse", withExtension: "json"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        #expect(!fixture.cases.isEmpty)
        for c in fixture.cases {
            let worse = try Engine.weatherWorse(then: c.input.then, now: c.input.now).worse
            #expect(worse.map(\.key) == c.keys, "\(c.why)")
            #expect(worse.map(\.line) == c.lines, "\(c.why)")
        }
    }

    static let briefing = """
    {"airports": {}, "hazards": [{"type": "SIGMET", "hazard": "TURB", "raw": "SIGMET NOVEMBER 3",
      "on_route": {"from_nm": 10, "to_nm": 40, "legs": [0], "source": "polygon"}},
     {"type": "AIRMET", "hazard": "IFR", "raw": "AIRMET SIERRA"}],
     "metars": {"KMSN": {"ceiling_ft": 800, "visibility_sm": 10}, "KDLH": null},
     "forecast": {"stations": [{"icaoId": "KDLH", "eta": "2026-11-09T18:00:00Z", "eta_ceiling_ft": 2000, "eta_visibility_sm": 6, "ceiling_ft": 400, "visibility_sm": 1}]},
     "weather_unavailable": []}
    """

    @Test func aBriefingIsCarriedIntoTheEnginesReading() throws {
        let briefing = try Planner.json.decode(Briefing.self, from: Data(Self.briefing.utf8))
        let reading = RouteWeather.of(briefing, lands: ["KDLH"])
        #expect(reading.metars?.map(\.ident) == ["KMSN"])
        #expect(reading.advisories?.map(\.onRoute) == [true, false])
        #expect(reading.advisories?.first?.key == "SIGMET NOVEMBER 3")
        // The TAF for the flight's time there, where the briefing placed it.
        let taf = try #require(reading.tafs?.first)
        #expect(taf.ceilingFt == 2000)
        #expect(taf.arrival == true)
    }

    static let worse = [
        EngineContract.WeatherWorseItem(key: "metar:KMSN:IFR", kind: "metar", ident: "KMSN", was: "VFR", now: "IFR",
                                        line: "KMSN is IFR now; it was VFR at the briefing", source: "AIM 7-1-7 (flight categories)"),
        EngineContract.WeatherWorseItem(key: "advisory:SIGMET NOVEMBER 3", kind: "advisory", ident: nil, was: nil, now: "TURB",
                                        line: "A new SIGMET (TURB) is on the route", source: "AIM 7-1-6"),
    ]

    @Test func eachChangeIsToldOnce() throws {
        let first = try #require(RouteWeather.telling(Self.worse, told: [], route: "KMSN to KDLH"))
        #expect(first.title == "Weather worse on KMSN to KDLH")
        #expect(first.body == "KMSN is IFR now; it was VFR at the briefing. A new SIGMET (TURB) is on the route.")
        #expect(first.fields == ["KMSN"])
        let again = RouteWeather.telling(Self.worse, told: Set(first.keys), route: "KMSN to KDLH")
        #expect(again == nil)
        let one = try #require(RouteWeather.telling(Self.worse, told: ["metar:KMSN:IFR"], route: "KMSN to KDLH"))
        #expect(one.keys == ["advisory:SIGMET NOVEMBER 3"])
    }

    @Test func theToldKeysBelongToTheirRoute() {
        let store = UserDefaults(suiteName: "WeatherWatchTests")!
        store.removePersistentDomain(forName: "WeatherWatchTests")
        let watch = WeatherWatch(store: store)
        #expect(watch.told(route: "KMSN KDLH").isEmpty)
    }

    @Test func alertsGoOnlyWhereThePilotAllowsThem() {
        #expect(WeatherWatch.allows(.authorized, alerts: .enabled))
        #expect(WeatherWatch.allows(.provisional, alerts: .enabled))
        #expect(!WeatherWatch.allows(.authorized, alerts: .disabled))
        #expect(!WeatherWatch.allows(.denied, alerts: .enabled))
        #expect(!WeatherWatch.allows(.notDetermined, alerts: .enabled))
    }

    @Test func onlyARecentPlanWithABriefingIsWatched() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        var kept = Kept(dep: "KMSN", dest: "KDLH", stops: [], aircraft: Plan.noAirplane, plannedAt: now.addingTimeInterval(-3600))
        #expect(!WeatherWatch.watching(kept, now: now))
        kept.briefing = try? Planner.json.decode(Briefing.self, from: Data(Self.briefing.utf8))
        #expect(WeatherWatch.watching(kept, now: now))
        kept.plannedAt = now.addingTimeInterval(-25 * 3600)
        #expect(!WeatherWatch.watching(kept, now: now))
    }

    @Test func theLiveActivityCarriesTheWeatherLine() {
        var inputs = FlightActivityContent.Inputs(progress: nil, routeNm: 142, airplaneChosen: false, usableFuelGal: nil,
                                                  frequency: nil, copilot: nil, now: Date())
        let before = FlightActivityContent.state(inputs)
        inputs.weather = "KMSN is IFR now; it was VFR at the briefing"
        let after = FlightActivityContent.state(inputs)
        #expect(after.weather == inputs.weather)
        #expect(FlightActivityContent.due(after, after: before, every: 30))
    }
}
