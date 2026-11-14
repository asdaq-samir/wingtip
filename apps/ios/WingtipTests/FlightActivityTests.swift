@testable import Wingtip
import XCTest

/// The Live Activity's content: what FlightActivityContent puts together
/// from the in-flight models, and the words FlightActivityLines writes
/// from it with Format.
@MainActor
final class FlightActivityTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func progress(nextEte: Double? = 12, destEte: Double? = 65, burnt: Double = 6.4) -> InFlight.Progress {
        InFlight.Progress(
            onRoute: true, alongNm: 40, totalNm: 142, leftNm: 102.4, offNm: 0.2, offSide: nil,
            desiredTrackDeg: 270, desiredTrackMagDeg: nil, trackMagDeg: nil, trackErrorDeg: nil, variationDeg: nil,
            burntGal: burnt, fuelNowGal: 31.1, taxiCounted: true,
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

    func testFiguresAreTheEnginesAnswer() {
        let state = FlightActivityContent.state(inputs(progress: progress()))
        XCTAssertEqual(state.nextFix, "PIPER")
        XCTAssertEqual(state.nextEteMin, 12)
        XCTAssertEqual(state.toGoNm, 102.4)
        XCTAssertEqual(state.destEteMin, 65)
        XCTAssertEqual(state.eta, now.addingTimeInterval(65 * 60))
        // The engine's fuel_now_gal, from the last fuel stop passed less
        // the taxi allowance (AV-4), not the app's own subtraction.
        XCTAssertEqual(state.fuelLeftGal ?? 0, 31.1, accuracy: 1e-9)
    }

    func testNoAirplaneNoFuel() {
        XCTAssertNil(FlightActivityContent.state(inputs(progress: progress(), airplane: false)).fuelLeftGal)
    }

    func testBeforeTheFirstFixTheWholeRouteIsAhead() {
        let state = FlightActivityContent.state(inputs(progress: nil))
        XCTAssertNil(state.nextFix)
        XCTAssertEqual(state.toGoNm, 142)
        XCTAssertNil(state.eta)
        XCTAssertEqual(state.fuelLeftGal, 40)
        let lines = FlightActivityLines(state)
        XCTAssertEqual(lines.eta, "—")
        XCTAssertEqual(lines.compact, "—")
        XCTAssertEqual(lines.toGo, "142 nm")
        XCTAssertEqual(lines.nextSentence, "To the destination")
    }

    func testCopilotMessageAndItsLevel() {
        let warning = FlightActivityContent.state(inputs(progress: progress(), copilot: message(level: "warning")))
        XCTAssertEqual(warning.copilot, "Fuel at landing under reserve")
        XCTAssertTrue(warning.copilotWarns)
        XCTAssertEqual(FlightActivityLines(warning).glyph, "exclamationmark.octagon.fill")
        let caution = FlightActivityContent.state(inputs(progress: progress(), copilot: message(level: "caution")))
        XCTAssertFalse(caution.copilotWarns)
        XCTAssertEqual(FlightActivityLines(caution).glyph, "exclamationmark.triangle.fill")
        // What the alerts banner draws is not the copilot's own line.
        XCTAssertNil(FlightActivityContent.state(inputs(progress: progress(), copilot: message(level: "warning", elsewhere: true))).copilot)
    }

    func testLinesAreFormatsWords() {
        let lines = FlightActivityLines(FlightActivityContent.state(inputs(progress: progress(), frequency: "Approach 124.35")))
        XCTAssertEqual(lines.next, "PIPER")
        XCTAssertEqual(lines.nextEte, "12m")
        // The compact island's figure is the time to the destination.
        XCTAssertEqual(lines.compact, "1h 5m")
        XCTAssertEqual(lines.toGo, "1h 5m · 102 nm")
        XCTAssertEqual(lines.fuel, "31.1 gal")
        XCTAssertEqual(lines.glyph, "airplane")
        XCTAssertEqual(lines.nextSentence, "Next PIPER in 12m")
        XCTAssertTrue(lines.spoken.contains("Approach 124.35"))
        XCTAssertTrue(lines.spoken.contains("31.1 gal planned left"))
    }

    func testNarrowIslandsFigureIsShort() {
        let lines = FlightActivityLines(FlightActivityContent.state(inputs(progress: progress(destEte: 45))))
        // Under an hour it is the usual figure.
        XCTAssertEqual(lines.compactNarrow, "45m")
        var long = lines.state
        long.destEteMin = 85
        XCTAssertEqual(FlightActivityLines(long).compact, "1h 25m")
        XCTAssertEqual(FlightActivityLines(long).compactNarrow, "1:25")
        XCTAssertEqual(FlightActivityLines(FlightActivityContent.state(inputs(progress: nil))).compactNarrow, "—")
    }

    func testFrequencyIsTheNewestHandedUs() {
        let older = AtcCopilot.Card(id: 1, text: "", at: now, items: [.init(kind: "frequency", mhz: "120.1", facility: "center")])
        let newer = AtcCopilot.Card(id: 2, text: "", at: now, items: [.init(kind: "squawk", code: "4521")])
        let newest = AtcCopilot.Card(id: 3, text: "", at: now, items: [.init(kind: "frequency", mhz: "124.35", facility: "approach")])
        XCTAssertEqual(FlightActivityContent.frequency(in: [newest, newer, older]), "Approach 124.35")
        XCTAssertEqual(FlightActivityContent.frequency(in: [newer, older]), "Center 120.1")
        XCTAssertNil(FlightActivityContent.frequency(in: [newer]))
    }

    func testControlStateIsKeptInTheAppGroupsDefaults() throws {
        let store = try XCTUnwrap(UserDefaults(suiteName: "FlightActivityTests"))
        store.removePersistentDomain(forName: "FlightActivityTests")
        XCTAssertFalse(FlightControlState.read(from: store))
        FlightControlState.write(running: true, to: store)
        XCTAssertTrue(FlightControlState.read(from: store))
        FlightControlState.write(running: false, to: store)
        XCTAssertFalse(FlightControlState.read(from: store))
    }

    func testStartFlightWithNoRouteSaysWhy() async {
        XCTAssertFalse(FlightActivity.shared.startByPilot(kept: nil))
        XCTAssertEqual(FlightActivity.shared.problem, "Plan a route first, then start the flight.")
        // Stopping with nothing running is no problem.
        let stopped = await FlightSwitch.set(false)
        XCTAssertNil(stopped)
    }

    func testUpdatesAreDueOnChangeOrEveryThirtySeconds() {
        let first = FlightActivityContent.state(inputs(progress: progress()))
        XCTAssertTrue(FlightActivityContent.due(first, after: nil, every: 30))
        var soon = first
        soon.updatedAt = now.addingTimeInterval(10)
        soon.toGoNm = 101
        XCTAssertFalse(FlightActivityContent.due(soon, after: first, every: 30))
        soon.nextFix = "GOPHER"
        XCTAssertTrue(FlightActivityContent.due(soon, after: first, every: 30))
        var later = first
        later.updatedAt = now.addingTimeInterval(30)
        XCTAssertTrue(FlightActivityContent.due(later, after: first, every: 30))
    }

    // MARK: - Phases (docs/design/ios.md §15, Flighty's)

    func testInTheAirTheProgressIsTheEnginesMilesAlong() {
        let state = FlightActivityContent.state(inputs(progress: progress()))
        XCTAssertEqual(state.phase, .airborne)
        XCTAssertEqual(state.progress ?? 0, 40.0 / 142.0, accuracy: 1e-9)
        XCTAssertEqual(state.nextNm, 21)
        XCTAssertEqual(FlightActivityLines(state).nextLine, "PIPER · 21 nm · 12m")
        // No progress before the first fix.
        XCTAssertNil(FlightActivityContent.state(inputs(progress: nil)).progress)
    }

    func testBeforeDepartureTheBoardShowsTheCategoryAndThePlannedTime() {
        var ready = inputs(progress: nil)
        ready.phase = .ready
        ready.depCategory = "MVFR"
        ready.plannedEteMin = 95
        let lines = FlightActivityLines(FlightActivityContent.state(ready))
        XCTAssertEqual(lines.phase, .ready)
        XCTAssertEqual(lines.readyLine, "Ready to depart · MVFR")
        XCTAssertEqual(lines.compact, "1h 35m")
        XCTAssertEqual(lines.compactNarrow, "1:35")
        XCTAssertEqual(lines.spoken, "Ready to depart · MVFR, 1h 35m en route")
    }

    func testArrivedGivesTheLandingAndTheBlockTime() {
        var down = inputs(progress: progress())
        down.phase = .arrived
        down.startedAt = now
        down.landedAt = now.addingTimeInterval(85 * 60)
        let state = FlightActivityContent.state(down)
        XCTAssertEqual(state.progress, 1)
        XCTAssertEqual(state.blockMin ?? 0, 85, accuracy: 1e-9)
        let lines = FlightActivityLines(state)
        XCTAssertEqual(lines.block, "Block 1h 25m")
        XCTAssertEqual(lines.compact, "Landed")
        XCTAssertEqual(lines.compactNarrow, "")
        // A phase change is sent at once.
        XCTAssertTrue(FlightActivityContent.due(state, after: FlightActivityContent.state(inputs(progress: progress())), every: 30))
    }

    func testAStateFromBeforePhasesReadsAsInTheAir() {
        var state = FlightActivityContent.state(inputs(progress: progress()))
        state.phase = nil
        XCTAssertEqual(FlightActivityLines(state).phase, .airborne)
    }
}
