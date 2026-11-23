import Foundation
import Testing
@testable import Wingtip

/// The Live Activity's content: what FlightActivityContent puts together
/// from the in-flight models, and the words FlightActivityLines writes
/// from it with Format.
@MainActor
struct FlightActivityTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func progress(nextEte: Double? = 12, destEte: Double? = 65, burnt: Double = 6.4) -> InFlight.Progress {
        InFlight.Progress(
            onRoute: true, alongNm: 40, totalNm: 142, leftNm: 102.4, offNm: 0.2, offSide: nil,
            desiredTrackDeg: 270, desiredTrackMagDeg: nil, trackMagDeg: nil, trackErrorDeg: nil, variationDeg: nil,
            burntGal: burnt, fuelNowGal: 31.1, taxiCounted: true, hop: 0, hopBurntGal: burnt,
            next: .init(index: 2, name: "PIPER", distanceNm: 21, bearingDeg: 271, bearingMagDeg: nil,
                        eteMin: nextEte, etaS: nil, fuelLeftGal: nil),
            destination: .init(index: 5, name: "KDLH", distanceNm: 102.4, bearingDeg: 300, bearingMagDeg: nil,
                               eteMin: destEte, etaS: destEte.map { now.timeIntervalSince1970 + $0 * 60 }, fuelLeftGal: nil))
    }

    private func inputs(progress: InFlight.Progress?, airplane: Bool = true, copilot: Copilot.Message? = nil,
                        frequency: String? = nil) -> FlightActivityContent.Inputs {
        .init(progress: progress, routeNm: 142, airplaneChosen: airplane, usableFuelGal: 40,
              frequency: frequency, copilot: copilot, now: now)
    }

    private func message(level: String, elsewhere: Bool = false) -> Copilot.Message {
        Copilot.Message(id: "fuel", kind: "fuel", level: level, title: "Fuel at landing under reserve", say: "",
                        detail: [], sources: [], elsewhere: elsewhere, alternative: nil)
    }

    @Test func figuresAreTheEnginesAnswer() {
        let state = FlightActivityContent.state(inputs(progress: progress()))
        #expect(state.nextFix == "PIPER")
        #expect(state.nextEteMin == 12)
        #expect(state.toGoNm == 102.4)
        #expect(state.destEteMin == 65)
        #expect(state.eta == now.addingTimeInterval(65 * 60))
        // The engine's fuel_now_gal, from the last fuel stop passed less
        // the taxi allowance (AV-4), not the app's own subtraction.
        #expect(abs((state.fuelLeftGal ?? 0) - 31.1) <= 1e-9)
    }

    @Test func noAirplaneNoFuel() {
        #expect(FlightActivityContent.state(inputs(progress: progress(), airplane: false)).fuelLeftGal == nil)
    }

    @Test func beforeTheFirstFixTheWholeRouteIsAhead() {
        let state = FlightActivityContent.state(inputs(progress: nil))
        #expect(state.nextFix == nil)
        #expect(state.toGoNm == 142)
        #expect(state.eta == nil)
        #expect(state.fuelLeftGal == 40)
        let lines = FlightActivityLines(state)
        #expect(lines.eta == "—")
        #expect(lines.compact == "—")
        #expect(lines.toGo == "142 nm")
        #expect(lines.nextSentence == "To the destination")
    }

    @Test func copilotMessageAndItsLevel() {
        let warning = FlightActivityContent.state(inputs(progress: progress(), copilot: message(level: "warning")))
        #expect(warning.copilot == "Fuel at landing under reserve")
        #expect(warning.copilotWarns)
        #expect(FlightActivityLines(warning).glyph == "exclamationmark.octagon.fill")
        let caution = FlightActivityContent.state(inputs(progress: progress(), copilot: message(level: "caution")))
        #expect(!caution.copilotWarns)
        #expect(FlightActivityLines(caution).glyph == "exclamationmark.triangle.fill")
        // What the alerts banner draws is not the copilot's own line.
        #expect(FlightActivityContent.state(inputs(progress: progress(), copilot: message(level: "warning", elsewhere: true))).copilot == nil)
    }

    @Test func linesAreFormatsWords() {
        let lines = FlightActivityLines(FlightActivityContent.state(inputs(progress: progress(), frequency: "Approach 124.35")))
        #expect(lines.next == "PIPER")
        #expect(lines.nextEte == "12m")
        // The compact island's figure is the time to the destination.
        #expect(lines.compact == "1h 5m")
        #expect(lines.toGo == "1h 5m · 102 nm")
        #expect(lines.fuel == "31.1 gal")
        #expect(lines.glyph == "airplane")
        #expect(lines.nextSentence == "Next PIPER in 12m")
        #expect(lines.spoken.contains("Approach 124.35"))
        #expect(lines.spoken.contains("31.1 gal planned left"))
    }

    @Test func narrowIslandsFigureIsShort() {
        let lines = FlightActivityLines(FlightActivityContent.state(inputs(progress: progress(destEte: 45))))
        // Under an hour it is the usual figure.
        #expect(lines.compactNarrow == "45m")
        var long = lines.state
        long.destEteMin = 85
        #expect(FlightActivityLines(long).compact == "1h 25m")
        #expect(FlightActivityLines(long).compactNarrow == "1:25")
        #expect(FlightActivityLines(FlightActivityContent.state(inputs(progress: nil))).compactNarrow == "—")
    }

    @Test func frequencyIsTheNewestHandedUs() {
        let older = AtcCopilot.Card(id: 1, text: "", at: now, items: [.init(kind: "frequency", mhz: "120.1", facility: "center")])
        let newer = AtcCopilot.Card(id: 2, text: "", at: now, items: [.init(kind: "squawk", code: "4521")])
        let newest = AtcCopilot.Card(id: 3, text: "", at: now, items: [.init(kind: "frequency", mhz: "124.35", facility: "approach")])
        #expect(FlightActivityContent.frequency(in: [newest, newer, older]) == "Approach 124.35")
        #expect(FlightActivityContent.frequency(in: [newer, older]) == "Center 120.1")
        #expect(FlightActivityContent.frequency(in: [newer]) == nil)
    }

    @Test func controlStateIsKeptInTheAppGroupsDefaults() throws {
        let store = try #require(UserDefaults(suiteName: "FlightActivityTests"))
        store.removePersistentDomain(forName: "FlightActivityTests")
        #expect(!FlightControlState.read(from: store))
        FlightControlState.write(running: true, to: store)
        #expect(FlightControlState.read(from: store))
        FlightControlState.write(running: false, to: store)
        #expect(!FlightControlState.read(from: store))
    }

    @Test func startFlightWithNoRouteSaysWhy() async {
        #expect(!FlightActivity.shared.startByPilot(kept: nil))
        #expect(FlightActivity.shared.problem == "Plan a route first, then start the flight.")
        // Stopping with nothing running is no problem.
        let stopped = await FlightSwitch.set(false)
        #expect(stopped == nil)
    }

    @Test func updatesAreDueOnChangeOrEveryThirtySeconds() {
        let first = FlightActivityContent.state(inputs(progress: progress()))
        #expect(FlightActivityContent.due(first, after: nil, every: 30))
        var soon = first
        soon.updatedAt = now.addingTimeInterval(10)
        soon.toGoNm = 101
        #expect(!FlightActivityContent.due(soon, after: first, every: 30))
        soon.nextFix = "GOPHER"
        #expect(FlightActivityContent.due(soon, after: first, every: 30))
        var later = first
        later.updatedAt = now.addingTimeInterval(30)
        #expect(FlightActivityContent.due(later, after: first, every: 30))
    }

    // MARK: - Phases (docs/design/ios.md §15, Flighty's)

    @Test func inTheAirTheProgressIsTheEnginesMilesAlong() {
        let state = FlightActivityContent.state(inputs(progress: progress()))
        #expect(state.phase == .airborne)
        #expect(abs((state.progress ?? 0) - 40.0 / 142.0) <= 1e-9)
        #expect(state.nextNm == 21)
        #expect(FlightActivityLines(state).nextLine == "PIPER · 21 nm · 12m")
        // No progress before the first fix.
        #expect(FlightActivityContent.state(inputs(progress: nil)).progress == nil)
    }

    @Test func beforeDepartureTheBoardShowsTheCategoryAndThePlannedTime() {
        var ready = inputs(progress: nil)
        ready.phase = .ready
        ready.depCategory = "MVFR"
        ready.plannedEteMin = 95
        let lines = FlightActivityLines(FlightActivityContent.state(ready))
        #expect(lines.phase == .ready)
        #expect(lines.readyLine == "Ready to depart · MVFR")
        #expect(lines.compact == "1h 35m")
        #expect(lines.compactNarrow == "1:35")
        #expect(lines.spoken == "Ready to depart · MVFR, 1h 35m en route")
    }

    @Test func arrivedGivesTheLandingAndTheBlockTime() {
        var down = inputs(progress: progress())
        down.phase = .arrived
        down.startedAt = now
        down.landedAt = now.addingTimeInterval(85 * 60)
        let state = FlightActivityContent.state(down)
        #expect(state.progress == 1)
        #expect(abs((state.blockMin ?? 0) - 85) <= 1e-9)
        let lines = FlightActivityLines(state)
        #expect(lines.block == "Block 1h 25m")
        #expect(lines.compact == "Landed")
        #expect(lines.compactNarrow == "")
        // A phase change is sent at once.
        #expect(FlightActivityContent.due(state, after: FlightActivityContent.state(inputs(progress: progress())), every: 30))
    }

    @Test func aStateFromBeforePhasesReadsAsInTheAir() {
        var state = FlightActivityContent.state(inputs(progress: progress()))
        state.phase = nil
        #expect(FlightActivityLines(state).phase == .airborne)
    }
}
