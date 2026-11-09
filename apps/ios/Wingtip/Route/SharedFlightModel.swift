import Foundation
import Observation

/// The Shared Flight preview's state and its calls (docs/navigation.md,
/// the `shared` screen): a flight another pilot sent, shown before anything
/// is planned. A plain link's plan is in the link; a saved flight's is read
/// from the gateway by its token, its filed nav log with it. Use This Plan
/// plans it through the route command a shared route always took
/// (PendingCommand.planRoute), then opens its nav log; Not Now leaves the
/// pilot's own plan as it was.
@MainActor
@Observable
final class SharedFlightModel {
    static let shared = SharedFlightModel()

    /// The gateway's call, a test's own in its place.
    struct Calls: Sendable {
        var fetch: @Sendable (String) async throws -> GWSharedFlightDto?

        static let gateway = Calls(fetch: { try await Gateway.sharedFlight($0) })
    }

    /// The saved flight's totals as filed.
    struct Totals: Equatable {
        var distanceNm: Double?
        var eteMin: Double?
        var fuelGal: Double?
    }

    /// The link being previewed; nil when none is up.
    private(set) var link: SharedFlightLink?
    /// The plan it shares, once known.
    private(set) var plan: SharedPlan?
    /// A saved flight's nav log as its pilot filed it; none for a plain link.
    private(set) var navLog: [GWFlightCheckpointDto] = []
    private(set) var totals: Totals?
    private(set) var loading = false
    /// The link's pilot stopped sharing it (or it never was).
    private(set) var gone = false
    /// Why the saved flight could not be read, under the preview.
    private(set) var problem: String?
    @ObservationIgnored private let calls: Calls

    init(calls: Calls = .gateway) { self.calls = calls }

    var showing: Bool { link != nil }

    /// A link opened: its plan shown at once, or read by `load`.
    func open(_ link: SharedFlightLink) {
        self.link = link
        navLog = []; totals = nil; gone = false; problem = nil
        if case .plan(let shared) = link { plan = shared } else { plan = nil }
    }

    /// A saved flight's share read from the gateway; nothing for a plain link.
    func load() async {
        guard case .saved(let token) = link else { return }
        loading = true
        defer { loading = false }
        do {
            guard let shared = try await calls.fetch(token) else {
                gone = true
                return
            }
            plan = SharedPlan(shared)
            navLog = shared.checkpoints.sorted { $0.sequenceNo < $1.sequenceNo }
            totals = Totals(distanceNm: shared.totalDistanceNm, eteMin: shared.totalEteMin, fuelGal: shared.totalFuelGal)
        } catch {
            problem = "The shared flight could not be fetched: \(error.localizedDescription)"
        }
    }

    /// Not Now: the preview put away, the pilot's own plan untouched.
    func notNow() {
        link = nil
        plan = nil
    }

    /// Use This Plan: the route planned as it was sent, at its altitude and
    /// under its rules where it says them, then its nav log opened. The
    /// airplane stays the pilot's own: the sender's type is never assumed.
    func use(on route: Plan, commands: PendingCommand = .shared, defaults: UserDefaults = .standard) {
        guard let shared = plan else { return }
        route.ownAltitudeFt = shared.altitudeFt.map(Double.init)
        route.ownAltitudeLegal = false
        route.altitudeChoice = nil
        route.procedures = []
        route.extras = RouteExtras()
        if let rules = shared.rules { defaults.set(rules.rawValue, forKey: FlightRules.key) }
        commands.then = .navlog
        commands.command = .planRoute(dep: shared.dep, stops: shared.stops, dest: shared.dest)
        notNow()
    }
}
