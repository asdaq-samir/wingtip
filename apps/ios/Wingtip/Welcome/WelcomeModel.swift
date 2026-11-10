import Foundation
import Observation

/// The welcome's state, the screen's one model (WelcomeView): shown once
/// per install, skippable at every step, never again once finished or
/// skipped, and shown again from Setup's Show Welcome Again. It walks the
/// pilot through the airplane (none by default, docs/decisions/0011),
/// the home airport, VFR or IFR, the two permissions it asks for with a
/// sentence before the system's own question, and then a sample flight
/// or their own.
@MainActor
@Observable
final class WelcomeModel {
    static let shared = WelcomeModel()

    enum Step: Int, CaseIterable, Sendable {
        case airplane, home, rules, location, notifications, finish
    }

    /// Set once the welcome is finished or skipped, beside the app's other
    /// first-run keys in the standard defaults.
    static let seenKey = "welcomeSeen"
    /// The pilot's home airport kept on this phone: the field a one-ident
    /// route is flown from when the position is not known.
    static let homeKey = "homeAirport"
    /// The sample flight, the same on every platform: Madison to Oshkosh,
    /// no stops.
    static let sampleDep = "KMSN"
    static let sampleDest = "KOSH"

    private(set) var step: Step = .airplane
    var presented = false
    /// The steps whose system question is already answered, passed over.
    private(set) var answered: Set<Step> = []
    /// An N-number typed on the airplane step.
    var typedTail = ""
    private(set) var own: [OwnAircraftRecord] = []
    @ObservationIgnored private var profiles: [AircraftProfile] = []
    var homeQuery = ""
    private(set) var homeFound: [AirportSuggestion] = []
    private(set) var homeProblem: String?
    private(set) var home: String?
    var rules: FlightRules {
        didSet { defaults.set(rules.rawValue, forKey: FlightRules.key) }
    }

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let search: @Sendable (String) async throws -> [AirportSuggestion]

    init(defaults: UserDefaults = .standard,
         search: @escaping @Sendable (String) async throws -> [AirportSuggestion] = { try await Planner.search($0) }) {
        self.defaults = defaults
        self.search = search
        home = defaults.string(forKey: Self.homeKey)
        rules = FlightRules.saved(defaults)
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
        step = .airplane
        presented = true
    }

    /// Setup's Show Welcome Again: unseen, and shown now.
    func again() {
        defaults.removeObject(forKey: Self.seenKey)
        step = .airplane
        presented = true
    }

    /// The next step not already answered; past the last, finished.
    func next() {
        var at = step.rawValue + 1
        while let candidate = Step(rawValue: at), answered.contains(candidate) { at += 1 }
        guard let following = Step(rawValue: at) else { finish(); return }
        step = following
    }

    func skip() { finish() }

    func finish() {
        defaults.set(true, forKey: Self.seenKey)
        presented = false
    }

    /// The permissions already decided, so their steps are passed over.
    func knowAnswered(location: Bool, notifications: Bool) {
        answered = Set([location ? Step.location : nil, notifications ? Step.notifications : nil].compactMap { $0 })
    }

    /// The airplane: none, the plan's start (docs/decisions/0011).
    func flyNoAirplane(_ plan: Plan) {
        typedTail = ""
        plan.flyNoAirplane()
    }

    /// An airplane by its N-number, as the Airplane tab flies one: the
    /// pilot's own with its figures, else the registry's type.
    func fly(_ tail: String, plan: Plan) async {
        let tail = tail.uppercased().trimmingCharacters(in: .whitespaces)
        guard (try? Registered.isNNumber(tail)) == true else { return }
        if profiles.isEmpty { profiles = (try? await Planner.aircraftProfiles()) ?? [] }
        await plan.fly(tail: tail, own: own, profiles: profiles)
    }

    /// The pilot's own airplanes, where signed in, to pick from.
    func loadOwn(signedIn: Bool) async {
        guard signedIn else { own = []; return }
        own = (try? await Gateway.aircraftRecords()) ?? []
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

    /// The home airport picked, or (nil) none.
    func pickHome(_ ident: String?) {
        home = ident
        if let ident { defaults.set(ident, forKey: Self.homeKey) } else { defaults.removeObject(forKey: Self.homeKey) }
        homeQuery = ""
        homeFound = []
    }

    /// The fields by ident or name as typed, through the planner's search
    /// (the Airport tab's); asked once the typing pauses.
    func findHome() async {
        let q = homeQuery.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { homeFound = []; homeProblem = nil; return }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        do {
            let found = try await search(q)
            guard !Task.isCancelled else { return }
            homeFound = Array(found.prefix(6))
            homeProblem = nil
        } catch {
            guard !Task.isCancelled else { return }
            homeProblem = "The airports couldn't be searched: \(error.localizedDescription)"
        }
    }
}
