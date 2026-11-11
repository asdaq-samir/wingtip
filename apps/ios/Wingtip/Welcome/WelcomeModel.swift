import Foundation
import Observation

/// The welcome's state, the screen's one model (WelcomeView): one card,
/// shown once per install, never again once taken or put away, and shown
/// again from Settings' Show Welcome Again. It asks nothing up front
/// (docs/design/ios.md §14; HIG Onboarding: "Postpone nonessential setup
/// flows"; HIG Accounts: "Delay sign-in"): no airplane (none by default,
/// docs/decisions/0011, asked where a figure first needs one), no
/// account, and no permission, each asked where it is first wanted.
@MainActor
@Observable
final class WelcomeModel {
    static let shared = WelcomeModel()

    /// Set once the welcome is taken or put away, beside the app's other
    /// first-run keys in the standard defaults.
    static let seenKey = "welcomeSeen"
    /// The pilot's home airport kept on this phone by the welcome of
    /// earlier versions: the field a one-ident route is flown from when the
    /// position is not known and the account has no home base.
    static let homeKey = "homeAirport"
    /// The sample flight, the same on every platform: Madison to Oshkosh,
    /// no stops.
    static let sampleDep = "KMSN"
    static let sampleDest = "KOSH"

    var presented = false

    @ObservationIgnored private let defaults: UserDefaults
    /// Opens the one search, focused (RootView's .open(.airport)).
    @ObservationIgnored private let focusSearch: @MainActor () -> Void

    init(defaults: UserDefaults = .standard, focusSearch: @escaping @MainActor () -> Void = { PendingCommand.shared.command = .open(.airport) }) {
        self.defaults = defaults
        self.focusSearch = focusSearch
    }

    var seen: Bool { defaults.bool(forKey: Self.seenKey) }

    /// Whether the welcome is wanted at launch: not once seen, and not under
    /// the UI tests' and CI's pictures' launch arguments, where it would
    /// cover what they look at; `-welcome` asks for it all the same.
    static func wanted(defaults: UserDefaults = .standard, arguments: [String] = CommandLine.arguments) -> Bool {
        if arguments.contains("-welcome") { return true }
        if arguments.contains(where: { ["-screen", "-layout", "-fresh"].contains($0) }) { return false }
        return !defaults.bool(forKey: seenKey)
    }

    /// The home airport kept, for the strip's one-ident route.
    static func savedHome(_ defaults: UserDefaults = .standard) -> String? {
        defaults.string(forKey: homeKey)
    }

    func showIfWanted(arguments: [String] = CommandLine.arguments) {
        guard Self.wanted(defaults: defaults, arguments: arguments) else { return }
        presented = true
    }

    /// Settings' Show Welcome Again: unseen, and shown now.
    func again() {
        defaults.removeObject(forKey: Self.seenKey)
        presented = true
    }

    /// The card's one action: put away, and the one search up and focused.
    func searchAnAirport() {
        finish()
        focusSearch()
    }

    /// Not Now, or the card pulled down: put away for good.
    func finish() {
        defaults.set(true, forKey: Self.seenKey)
        presented = false
    }

    /// The sample flight planned and the welcome done: the map's route,
    /// the nav log and the Brief follow from the plan.
    func openSample(_ plan: Plan) {
        plan.dep = Self.sampleDep
        plan.stops = []
        plan.dest = Self.sampleDest
        plan.plan()
        finish()
    }
}
