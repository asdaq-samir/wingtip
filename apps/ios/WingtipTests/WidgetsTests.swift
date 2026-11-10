import Foundation
import Testing
@testable import Wingtip

/// The configurable widgets' shared parts: the lists the app leaves in
/// the App Group for their settings (WidgetStore), written only as they
/// change, and the Currency Status widget's words (CurrencyWords), the
/// Logbook's, from the gateway's days.
@MainActor
struct WidgetsTests {
    private func store() -> UserDefaults {
        let name = "widgets-tests-\(UUID().uuidString)"
        return UserDefaults(suiteName: name)!
    }

    @Test func savedFlightsAreWrittenOnlyAsTheyChange() {
        let defaults = store()
        let flight = WidgetStore.SavedFlight(id: 7, title: "Oshkosh", dep: "KMSN", dest: "KOSH", stops: [],
                                             distanceNm: 64, eteMin: 38, fuelGal: 5.2, plannedFor: nil)
        #expect(WidgetStore.write([flight], to: defaults))
        #expect(!WidgetStore.write([flight], to: defaults))
        #expect(WidgetStore.savedFlights(from: defaults) == [flight])
    }

    @Test func theHomeBaseIsOfferedFirst() {
        let defaults = store()
        let airports = [WidgetStore.Airport(ident: "KMSN", name: "Dane County Regional"), WidgetStore.Airport(ident: "KOSH", name: "Wittman Regional")]
        WidgetStore.write(airports, to: defaults)
        #expect(WidgetStore.airports(from: defaults).map(\.ident) == ["KMSN", "KOSH"])
    }

    @Test func aLastGoodDayIsCurrentThroughThatDay() {
        #expect(CurrencyWords.until("2026-12-03", today: "2026-12-03") == .init(words: "To 3 Dec 2026", standing: .current))
        #expect(CurrencyWords.until("2026-12-03", today: "2026-12-04") == .init(words: "Ended 3 Dec 2026", standing: .lapsed))
        #expect(CurrencyWords.until(nil, today: "2026-12-04") == .init(words: "Not current", standing: .lapsed))
    }

    // 14 CFR 61.57(c)(1): approaches flown this month count from the first
    // of the next; 61.57(d): past six calendar months, only an IPC restores it.
    @Test func instrumentCurrencyNotBegunYet_andAnIPCNeeded() {
        #expect(CurrencyWords.instrument(until: "2027-05-31", from: "2026-12-01", ipcNeededAfter: nil, today: "2026-11-09")
            == .init(words: "From 1 Dec 2026", standing: .notYet))
        #expect(CurrencyWords.instrument(until: "2026-05-31", from: nil, ipcNeededAfter: "2026-11-30", today: "2026-12-01")
            == .init(words: "IPC needed", standing: .lapsed))
        #expect(CurrencyWords.instrument(until: "2027-05-31", from: nil, ipcNeededAfter: nil, today: "2026-11-09").standing == .current)
    }
}
