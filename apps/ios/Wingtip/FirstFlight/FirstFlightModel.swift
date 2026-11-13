import Foundation
import Observation

/// The first flight's welcome (WelcomeSheet; the web's FirstFlight and
/// WelcomeSheet, the owner's option A, 2026-11-13): offered the first time
/// the app opens with no route on this iPhone, and gone for good once put
/// away; the Guide's Show the Welcome Again brings it back. It asks no
/// airplane and no account up front (HIG Onboarding, "Postpone
/// nonessential setup flows"); the position it offers to turn on, as
/// Apple's own apps prime a permission, with Later beside it.
@MainActor
@Observable
final class FirstFlightModel {
    /// Set once the welcome has been put away, beside the app's other
    /// first-run keys in the standard defaults.
    static let seenKey = "firstFlightSeen"
    /// The pilot's home airport kept on this phone by the welcome of
    /// earlier versions: the field a one-ident route is flown from when the
    /// position is not known and the account has no home base.
    static let homeKey = "homeAirport"

    /// Bumped by Show the Welcome Again and its close, so the views read
    /// the seen key again (UserDefaults is not observed).
    private(set) var generation = 0

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let arguments: [String]
    @ObservationIgnored private let environment: [String: String]

    init(defaults: UserDefaults = .standard, arguments: [String] = CommandLine.arguments,
         environment: [String: String] = ProcessInfo.processInfo.environment) {
        self.defaults = defaults
        self.arguments = arguments
        self.environment = environment
        // A UI test's or a picture's first run, whatever an earlier run saw.
        if arguments.contains("-firstFlight") { defaults.removeObject(forKey: Self.seenKey) }
    }

    var seen: Bool {
        _ = generation
        return defaults.bool(forKey: Self.seenKey)
    }

    /// Whether the welcome is shown: with no route, until seen, and not
    /// under the UI tests' and CI's pictures' launch arguments, where it
    /// would cover what they look at, nor in the app that hosts the unit
    /// tests (as PlanningAidNotice); `-firstFlight` asks for it all the same.
    func shown(routed: Bool) -> Bool {
        guard !routed else { return false }
        if arguments.contains("-firstFlight") { return !seen }
        if environment["XCTestConfigurationFilePath"] != nil { return false }
        if arguments.contains(where: { ["-screen", "-layout", "-fresh", "-card"].contains($0) }) { return false }
        return !seen
    }

    /// The home field kept, for a one-ident route with no position.
    static func savedHome(_ defaults: UserDefaults = .standard) -> String? {
        defaults.string(forKey: homeKey)
    }

    /// Put away for good, until Show the Welcome Again.
    func dismiss() {
        defaults.set(true, forKey: Self.seenKey)
        generation += 1
    }

    /// The Guide's Show the Welcome Again: unseen, back where there is no
    /// route.
    func again() {
        defaults.removeObject(forKey: Self.seenKey)
        generation += 1
    }
}
