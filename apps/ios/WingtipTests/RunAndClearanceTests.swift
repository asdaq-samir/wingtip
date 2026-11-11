import Testing
@testable import Wingtip

/// The dry run's playback bar and the clearance's checks (docs/design/
/// ios.md §11, §12): the scrubber's leg ticks, the run's clock said in
/// full, the step from row to row under Reduce Motion, and which places
/// a clearance leaves to check.
@MainActor
struct RunAndClearanceTests {
    @Test func ticksSitAtEachRowInsideTheRun() {
        #expect(DryRunClock.ticks([0, 300, 900, 1200], total: 1200) == [0.25, 0.75])
        #expect(DryRunClock.ticks([0, 300], total: 0).isEmpty)
    }

    @Test func theClockIsSaidInFull() {
        let said = DryRunClock.spoken(zulu: "1432Z", flownMin: 12, forecastHour: "14Z")
        #expect(said.contains("Zulu"))
        #expect(said.contains("forecast for"))
        #expect(!DryRunClock.spoken(zulu: nil, flownMin: 0, forecastHour: nil).contains("forecast"))
    }

    @Test func reduceMotionStepsFromRowToRow() {
        #expect(DryRun.nextStop(after: 0, rowT: [0, 300, 900], total: 1200) == 300)
        #expect(DryRun.nextStop(after: 300, rowT: [0, 300, 900], total: 1200) == 900)
        #expect(DryRun.nextStop(after: 900, rowT: [0, 300, 900], total: 1200) == 1200)
    }

    @Test func aGuessOrAMissingPlaceIsOneToCheck() {
        let sure = ClearancePlaces.Place(said: "oshkosh", ident: "KOSH", sure: true)
        let guess = ClearancePlaces.Place(said: "badger", ident: "BAE", sure: false)
        #expect(!ClearanceCraftSection.unsure(nil))
        #expect(!ClearanceCraftSection.unsure(ClearancePlaces(limit: sure, route: [[sure]])))
        #expect(ClearanceCraftSection.unsure(ClearancePlaces(limit: sure, route: [[guess]])))
        #expect(ClearanceCraftSection.unsure(ClearancePlaces(limit: ClearancePlaces.Place(said: "nowhere", ident: nil, sure: nil))))
    }
}
