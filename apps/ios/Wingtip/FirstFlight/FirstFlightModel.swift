import Foundation
import Observation

/// The first flight's card (FirstFlightSection), the web's FirstFlight
/// and useFirstFlight: offered the first time the app opens with no route
/// on this iPhone, and gone for good once it has planned one or been put
/// away (Not Now); the Guide's Show First Flight Again brings it back.
/// It replaced the welcome (the owner, 2026-11-11: "We don't need the
/// welcome"), and asks nothing up front: no airplane, no account and no
/// permission (HIG Onboarding, "Postpone nonessential setup flows"), each
/// asked where it is first wanted.
///
/// Plan It plans to the destination from where the pilot is -- the field
/// nearest own ship's fix (the planner's /api/airports/nearest) -- else
/// from the account's home base or the home field an earlier welcome kept;
/// with neither, it asks where from (`needsFrom`). The route is then set
/// as the route box sets it and the nav log opened over it.
@MainActor
@Observable
final class FirstFlightModel {
    static let shared = FirstFlightModel()

    /// Set once the card has planned a route or been put away, beside the
    /// app's other first-run keys in the standard defaults.
    static let seenKey = "firstFlightSeen"
    /// The pilot's home airport kept on this phone by the welcome of
    /// earlier versions: the field a one-ident route is flown from when the
    /// position is not known and the account has no home base.
    static let homeKey = "homeAirport"

    /// The destination as typed, and the field picked from its matches.
    var dest = "" { didSet { if dest != oldValue { typed(dest, into: \.destMatches) } } }
    /// Where from, asked only where the app knows no position and no home.
    var from = "" { didSet { if from != oldValue { typed(from, into: \.fromMatches) } } }
    private(set) var destMatches: [AirportSuggestion] = []
    private(set) var fromMatches: [AirportSuggestion] = []
    private(set) var needsFrom = false
    private(set) var planning = false
    /// Why Plan It could not plan, said under the fields.
    private(set) var problem: String?
    /// Bumped by Show First Flight Again and Not Now, so the card's own
    /// views read the seen key again (UserDefaults is not observed).
    private(set) var generation = 0

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let arguments: [String]
    @ObservationIgnored private var searching: Task<Void, Never>?

    init(defaults: UserDefaults = .standard, arguments: [String] = CommandLine.arguments) {
        self.defaults = defaults
        self.arguments = arguments
        // A UI test's or a picture's first run, whatever an earlier run saw.
        if arguments.contains("-firstFlight") { defaults.removeObject(forKey: Self.seenKey) }
    }

    var seen: Bool {
        _ = generation
        return defaults.bool(forKey: Self.seenKey)
    }

    /// Whether the card is shown: with no route, until seen, and not under
    /// the UI tests' and CI's pictures' launch arguments, where it would
    /// cover what they look at; `-firstFlight` asks for it all the same.
    func shown(routed: Bool) -> Bool {
        guard !routed else { return false }
        if arguments.contains("-firstFlight") { return !seen }
        if arguments.contains(where: { ["-screen", "-layout", "-fresh", "-card"].contains($0) }) { return false }
        return !seen
    }

    /// The home field kept, for a one-ident route with no position.
    static func savedHome(_ defaults: UserDefaults = .standard) -> String? {
        defaults.string(forKey: homeKey)
    }

    /// The destination's ident: the field picked, else what is typed.
    var destIdent: String { Self.ident(dest) }
    var fromIdent: String { Self.ident(from) }

    /// Plan It's state: a destination, and where from where it was asked.
    var ready: Bool { !destIdent.isEmpty && (!needsFrom || !fromIdent.isEmpty) && !planning }

    /// The ident at the front of a field's words ("KOSH · Wittman
    /// Regional", as a picked match writes it, or "kosh" typed).
    static func ident(_ text: String) -> String {
        let first = text.split(separator: "·").first.map(String.init) ?? text
        return first.trimmingCharacters(in: .whitespaces).uppercased()
    }

    /// A match picked: the field's ident and name in its box, the list gone.
    func pick(_ field: AirportSuggestion, from isFrom: Bool = false) {
        // Its words hold "·", so the search is not asked again and the
        // list is emptied (typed).
        let words = "\(field.ident) · \(field.name)"
        if isFrom { from = words } else { dest = words }
    }

    /// Not Now: put away for good, until Show First Flight Again.
    func dismiss() {
        defaults.set(true, forKey: Self.seenKey)
        generation += 1
    }

    /// The Guide's Show First Flight Again: unseen, the card back where
    /// there is no route.
    func again() {
        defaults.removeObject(forKey: Self.seenKey)
        dest = ""; from = ""; needsFrom = false; problem = nil
        generation += 1
    }

    /// Plan It: the departure found (see the type's note), the route set
    /// and planned, the card seen, and `planned` (the nav log opened).
    /// `nearest` is the planner's nearest field to a fix, a parameter so
    /// the tests need no planner.
    func planIt(plan: Plan, fix: OwnShip.Fix?, home: String?,
                nearest: (OwnShip.Fix) async throws -> String? = FirstFlightModel.nearestField,
                planned: () -> Void) async {
        problem = nil
        planning = true
        defer { planning = false }
        let dest = destIdent
        var dep = fromIdent
        if dep.isEmpty, let fix {
            do { dep = try await nearest(fix) ?? "" } catch { problem = "The planner couldn't be reached; check the connection." }
        }
        if dep.isEmpty, let home = home ?? Self.savedHome(defaults), !home.isEmpty { dep = home.uppercased() }
        guard !dep.isEmpty else {
            // No position and no home: the card asks where from.
            needsFrom = true
            return
        }
        guard dep != dest else {
            problem = "\(dest) is where you are. Pick somewhere to fly to."
            return
        }
        problem = nil
        plan.dep = dep
        plan.stops = []
        plan.dest = dest
        plan.plan()
        dismiss()
        planned()
    }

    /// The field nearest a fix, from the planner.
    nonisolated static func nearestField(_ fix: OwnShip.Fix) async throws -> String? {
        try await Planner.nearest(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, limit: 1).first?.ident
    }

    /// The planner's airport search as the field is typed (the one
    /// search's own, /api/airports/search), once the typing stops; a
    /// picked match's words ask nothing.
    private func typed(_ text: String, into matches: ReferenceWritableKeyPath<FirstFlightModel, [AirportSuggestion]>) {
        searching?.cancel()
        let q = text.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2, !q.contains("·") else {
            self[keyPath: matches] = []
            return
        }
        searching = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let found = (try? await Planner.search(q)) ?? []
            guard !Task.isCancelled, let self else { return }
            self[keyPath: matches] = Array(found.prefix(4))
        }
    }
}
