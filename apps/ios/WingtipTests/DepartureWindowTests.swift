import Foundation
import Testing
@testable import Wingtip

/// "When should I go?": its question from the Go / No-Go's and its
/// hours in words, as the web's hourWords writes them.
@MainActor
struct DepartureWindowTests {
    private let chicago = TimeZone(identifier: "America/Chicago")!

    @Test func theQuestionIsTheGoNoGosWithEachHourADeparture() throws {
        var go = GoNoGoAsk(dep: "KDLH", dest: "KHIB")
        go.stops = "KCKC"
        go.aircraft = "c172"
        go.minimums = PersonalMinimums(ceilingFt: 3000)
        let ask = try DepartureWindow.ask(go, airplane: true)
        #expect(ask.dep == "KDLH" && ask.dest == "KHIB" && ask.stops == "KCKC" && ask.aircraft == "c172")
        #expect(ask.minimums?.ceilingFt == 3000 && ask.hours == 48 && ask.airplane == true && ask.rules == "vfr")
    }

    @Test func hoursInWords() throws {
        let json = #"{"airplane":true,"forecast_until":"2026-11-10T18:00:00Z","hours":[{"depart":"2026-11-09T13:00:00Z","ete_min":58,"fuel_gal":11.6,"margin":2,"night":false,"night_passengers":false,"reasons":[{"key":"weather","label":"Weather","finding":"ok","detail":"VFR all the way","tab":"weather"}],"verdict":"go"},{"depart":"2026-11-10T02:00:00Z","night":true,"night_passengers":true,"reasons":[],"verdict":"no-go"}],"windows":[{"start":"2026-11-09T13:00:00Z","last":"2026-11-09T16:00:00Z","hours":4,"quickest":"2026-11-09T13:00:00Z"}]}"#
        let answer = try Planner.json.decode(WindowAnswer.self, from: Data(json.utf8))
        let now = try #require(AirportWords.date("2026-11-09T12:00:00Z"))
        // 1300Z is 07:00 in Chicago (CST, UTC-6).
        #expect(DepartureWindow.bestLine(answer.windows[0], now: now, zone: chicago) == "Best: 07:00–10:00 CST")
        #expect(DepartureWindow.dayOf(answer.hours[1].depart, now: now, zone: chicago) == nil)
        #expect(DepartureWindow.figures(answer.hours[0], airplane: true) == "ETE 58m · 11.6 gal")
        #expect(DepartureWindow.figures(answer.hours[0], airplane: false) == "ETE and fuel need an airplane")
        #expect(DepartureWindow.label(answer.hours[0], zone: chicago) == "07:00: Go. VFR all the way")
        #expect(DepartureWindow.label(answer.hours[1], zone: chicago) == "20:00: No-go, at night")
        let model = DepartureWindow()
        model.pick("x")
        model.pick("x")
        #expect(model.picked == nil)
    }
}
