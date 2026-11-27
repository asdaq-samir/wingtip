import Foundation
import SwiftData
import Testing
@testable import Wingtip

/// The pilot's records in the store (Records): each list kept and read back through the store
/// as the Aircraft tab keeps them, and the routes planned, newest first.
@MainActor
struct RecordsTests {
    private let n174 = KeptAirplane(hex: "a1b2c3", name: "N174HA", type: "C172")
    private let n3429 = KeptAirplane(hex: "ab12cd", name: "N3429J", type: "P28A")

    @Test func theListsGoThroughTheStoreAndComeBackWhole() throws {
        let container = try Records.inMemory()
        let tracking = Tracking(container: container)
        tracking.toggleFavorite(n174)
        tracking.remember(n174)
        tracking.remember(n3429)
        #expect(tracking.favorites == [n174] && tracking.recents == [n3429, n174])

        // Favorites and Recents are two lists of one record: taking it
        // off one leaves it on the other.
        tracking.toggleFavorite(n174)
        #expect(tracking.favorites.isEmpty && tracking.recents == [n3429, n174])
        tracking.forget(recent: "ab12cd")
        #expect(tracking.recents == [n174])
        #expect(try container.mainContext.fetchCount(FetchDescriptor<KeptAirplaneRecord>()) == 1)

        // Only a dozen Recents, the newest first.
        for i in 0..<(Tracking.recentCount + 3) { tracking.remember(KeptAirplane(hex: "c\(i)", name: "N\(i)", type: nil)) }
        #expect(tracking.recents.count == Tracking.recentCount && tracking.recents.first?.hex == "c14")

        let takeoff = AirplaneWatch(hex: "a1b2c3", name: "N174HA", kind: .takeoff)
        tracking.toggleWatch(takeoff)
        #expect(tracking.watching("A1B2C3", .takeoff) && !tracking.watching("a1b2c3", .land))

        // What the store holds is what the next Tracking reads.
        let later = Tracking(container: container)
        #expect(later.recents == tracking.recents && later.watches == [takeoff])
        later.toggleWatch(takeoff)
        #expect(later.watches.isEmpty)
    }

    @Test func twoDevicesRecordsOfOneAirplaneFoldIntoOne() throws {
        let container = try Records.inMemory()
        let theirs = KeptAirplaneRecord(hex: "a1b2c3", name: "N174HA", type: nil)
        theirs.favorite = true
        let ours = KeptAirplaneRecord(hex: "a1b2c3", name: "N174HA", type: "C172")
        ours.recent = true
        ours.recentAt = Date()
        container.mainContext.insert(theirs)
        container.mainContext.insert(ours)
        let tracking = Tracking(container: container)
        #expect(tracking.favorites.count == 1 && tracking.recents.count == 1)
        #expect(try container.mainContext.fetchCount(FetchDescriptor<KeptAirplaneRecord>()) == 1)
    }

    @Test func theAccountDeletedTakesEveryRecord() throws {
        let container = try Records.inMemory()
        let tracking = Tracking(container: container)
        tracking.toggleFavorite(n174)
        tracking.toggleWatch(AirplaneWatch(hex: "a1b2c3", name: "N174HA", kind: .land))
        PlanHistory.planned(RouteState(dep: "KMSN", dest: "KDPA"), at: Date(), in: container.mainContext)
        tracking.erase()
        #expect(tracking.favorites.isEmpty && tracking.watches.isEmpty)
        #expect(PlanHistory.routes(in: container.mainContext).isEmpty)
    }

    @Test func theRoutesPlannedAreKeptNewestFirstWithoutRepeats() throws {
        // The container held for the test: its context alone keeps no hold
        // on it, and SwiftData traps once it is freed.
        let container = try Records.inMemory()
        let context = container.mainContext
        let route = RouteState(dep: "KMSN", dest: "KDPA", stops: ["KJVL", "KRFD"], ownAltitudeFt: 4500)
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        PlanHistory.planned(route, at: start, in: context)
        PlanHistory.planned(RouteState(dep: "KMSN", dest: "KUGN"), at: start.addingTimeInterval(60), in: context)
        PlanHistory.planned(route, at: start.addingTimeInterval(120), in: context)
        let routes = PlanHistory.routes(in: context)
        #expect(routes.count == 2)
        #expect(routes[0].routeState == route && routes[0].plannedAt == start.addingTimeInterval(120))
        #expect(routes[1].dest == "KUGN")

        // An empty route is no plan; the list stays at the history's limit.
        PlanHistory.planned(RouteState(), at: start, in: context)
        for i in 0..<(PlanHistory.limit + 5) {
            PlanHistory.planned(RouteState(dep: "A\(i)", dest: "B"), at: start.addingTimeInterval(Double(200 + i)), in: context)
        }
        #expect(PlanHistory.routes(in: context).count == PlanHistory.limit)
    }
}
