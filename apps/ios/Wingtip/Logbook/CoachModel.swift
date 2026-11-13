import Foundation
import Observation

/// What the pilot holds, as the plan reads it: a student is held to the
/// solo endorsement instead of the flight review, and an instrument
/// rating adds instrument currency. The engine decides what each means;
/// here it is only which ratings are sent.
enum CoachCertificate: String, CaseIterable, Identifiable, Sendable {
    case student, `private`, instrument

    var id: String { rawValue }

    var label: String {
        switch self {
        case .student: "Student"
        case .private: "Private or Higher"
        case .instrument: "Instrument Rated"
        }
    }

    /// The ratings the planner's CoachAsk takes for it.
    var ratings: [String] {
        switch self {
        case .student: ["student"]
        case .private: ["private"]
        case .instrument: ["private", "instrument"]
        }
    }

    /// Kept on this phone, as the web app keeps it in the browser.
    static let key = "wingtip.coach.certificate"
}

/// What the app already fetches of the pilot from the gateway: the
/// logbook, the currency dates and a student's training.
struct CoachPilot: Sendable {
    var entries: [LogbookEntry]
    var currency: Currency?
    var training: Training?

    /// From the gateway, as the Logbook and Training screens fetch them.
    @Sendable static func fetch() async throws -> CoachPilot {
        CoachPilot(entries: try await Gateway.logbook(), currency: try await Gateway.currency(), training: try? await Gateway.training())
    }
}

/// The Coach screen's state and its calls (the web app's useCoach): the
/// pilot's record as the app has it, the certificate they hold, and on
/// their ask the engine's plan through the planner.
@MainActor
@Observable
final class CoachModel {
    private(set) var pilot: CoachPilot?
    private(set) var plan: ProficiencyPlan?
    private(set) var making = false
    /// Why the record or the plan could not be had, said in place.
    private(set) var problem: String?

    private let calls: CoachCalls
    private let fetchPilot: @Sendable () async throws -> CoachPilot
    private let fetchDebriefs: @Sendable () async -> [CoachDebrief]
    /// The saved flights' debriefs (CoachDebriefs), gathered as the plan is
    /// asked for.
    private(set) var debriefs: [CoachDebrief] = []
    private let defaults: UserDefaults

    init(calls: CoachCalls = .gateway, fetchPilot: @escaping @Sendable () async throws -> CoachPilot = CoachPilot.fetch,
         fetchDebriefs: @escaping @Sendable () async -> [CoachDebrief] = CoachDebriefs.fetch, defaults: UserDefaults = .standard) {
        self.calls = calls
        self.fetchPilot = fetchPilot
        self.fetchDebriefs = fetchDebriefs
        self.defaults = defaults
    }

    /// The certificate picked, or the likeliest until one is: a student
    /// with endorsements on file, instrument where a check or an approach
    /// is logged, else private (the web app's guess).
    var certificate: CoachCertificate {
        get {
            access(keyPath: \.certificate)
            if let kept = defaults.string(forKey: CoachCertificate.key).flatMap(CoachCertificate.init(rawValue:)) { return kept }
            if pilot?.training?.endorsements.isEmpty == false { return .student }
            if pilot?.currency?.ipcOn != nil || pilot?.entries.contains(where: { $0.approaches > 0 }) == true { return .instrument }
            return .private
        }
        set {
            withMutation(keyPath: \.certificate) { defaults.set(newValue.rawValue, forKey: CoachCertificate.key) }
        }
    }

    var ready: Bool { pilot != nil }

    func load() async {
        do {
            pilot = try await fetchPilot()
            problem = nil
        } catch {
            problem = "Your logbook could not be fetched: \(error.localizedDescription)"
        }
    }

    /// The ask from what the app holds, the saved flights' debriefs with it.
    func ask(home: String?, today: String = Day.today()) -> CoachAsk {
        let certificate = certificate
        let entries = (pilot?.entries ?? []).map(Self.entry)
        let held = certificate == .student ? (pilot?.training?.endorsements ?? []).map { APICoachEndorsement(code: $0.code, on: $0.endorsedOn) } : []
        let home = home.flatMap { $0.isEmpty ? nil : $0.uppercased() }
        return CoachAsk(debriefs: debriefs, entries: entries, flightReviewOn: pilot?.currency?.flightReviewOn, held: held, home: home,
                        ipcOn: pilot?.currency?.ipcOn, medicalExpiresOn: pilot?.currency?.medicalExpiresOn,
                        ratings: certificate.ratings, remindDays: nil, today: today)
    }

    /// The plan.
    func make(home: String?) async {
        guard !making else { return }
        making = true
        defer { making = false }
        problem = nil
        debriefs = await fetchDebriefs()
        do {
            plan = try await calls.plan(ask(home: home))
        } catch {
            problem = "Your plan could not be made: \(error.localizedDescription)"
        }
    }

    /// The words a currency's status is said in, from the engine's own
    /// status and days: nothing worked out here.
    static func statusWords(_ due: CoachDue) -> String {
        switch due.status {
        case "current": due.until.map { "To \(Day.said($0))" } ?? "Current"
        case "due_soon": due.daysLeft.map { "\($0) day\($0 == 1 ? "" : "s") left" } ?? "Due soon"
        case "lapsed": "Lapsed"
        case "pending": due.from.map { "From \(Day.said($0))" } ?? "Not yet"
        default: "Not on record"
        }
    }

    /// One line of evidence: "2 Nov 2026 at KMSN, ILS Y RWY 08: …", the
    /// approach's procedure beside its field where the line is one's.
    static func evidenceLine(_ e: APICoachEvidence) -> String {
        let place = e.procedure.map { "\(e.place), \($0)" } ?? e.place
        return "\(Day.said(e.flownOn)) at \(place): \(e.text)"
    }

    /// Where, how long and with whom a session is flown, as one line.
    static func sessionDetail(_ s: CoachSession) -> String {
        var parts: [String] = []
        if let place = s.place { parts.append(place.ident + (place.approach.map { ", \($0)" } ?? "")) }
        parts.append("About \(s.minutes) min")
        if s.instructor { parts.append("With an instructor") }
        return parts.joined(separator: " · ")
    }

    private static func entry(_ e: LogbookEntry) -> APICoachLogbookEntry {
        APICoachLogbookEntry(approaches: e.approaches, crossCountryHours: e.crossCountryHours, dayLandings: e.dayLandings, dualHours: e.dualHours,
                             flownOn: e.flownOn, holding: e.holding, instrumentHours: e.instrumentHours, nightHours: e.nightHours,
                             nightLandings: e.nightLandings, soloHours: e.soloHours, totalHours: e.totalHours, tracking: e.tracking)
    }
}
