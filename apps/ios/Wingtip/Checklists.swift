import Foundation
import Observation

/// The two lists an airplane's checklist is kept as, as a flight manual
/// sets them apart: its normal procedures, and its emergency procedures,
/// which the airplane's screen opens.
enum ChecklistKind: String, CaseIterable, Sendable {
    case normal, emergency

    /// The list's name on its row and in its title.
    var title: String {
        switch self {
        case .normal: "Checklist"
        case .emergency: "Emergency"
        }
    }
}

/// The headings a checklist can start from, the phases a flight manual
/// sets its procedures under, with no items under them: the pilot writes
/// those from their own airplane's flight manual. The app ships no
/// manufacturer's words, which are theirs to publish and right only for
/// the airplane they were written for. The web and Android apps start
/// from the same lists, in the same order.
enum ChecklistPhases {
    /// The order of a pilot's operating handbook's Normal Procedures
    /// (GAMA Specification No. 1, Section 4), each phase a checklist is
    /// run at, the engine's (`checklist_phases`); how a checklist is used
    /// is the FAA's Airplane Flying Handbook (FAA-H-8083-3C), chapter 2.
    /// Asked once; a refusal is kept and said where the list is started.
    static let normal = Result { try Engine.checklistPhases(kind: "normal") }

    /// The emergencies a handbook's Emergency Procedures cover (GAMA
    /// Specification No. 1, Section 3), in its order, the engine's.
    static let emergency = Result { try Engine.checklistPhases(kind: "emergency") }

    static func headings(_ kind: ChecklistKind) throws -> [String] {
        switch kind {
        case .normal: try normal.get()
        case .emergency: try emergency.get()
        }
    }

    /// The headings as checklist text, a "#" line each with a blank line
    /// under it to write in. Read as it is, it is no checklist at all: the
    /// engine's reader drops a section with no items.
    static func text(_ kind: ChecklistKind) throws -> String {
        try headings(kind).map { "# \($0)\n" }.joined(separator: "\n")
    }
}

/// Each airplane's checklists, kept on this device as the pilot wrote
/// them (the owner's decision on #220, 2026-11-08: free, and local), by
/// the airplane's N-number, else the type's name where none is picked.
/// Kept as text, so headings not yet written under stay there to write
/// under next time. Signing out forgets them (Session.forgetPilot), as it
/// forgets the rest the device kept of the pilot's (the owner's
/// "sign-out clears", 2026-10-20, held for the checklists on 2026-11-08).
enum LocalChecklists {
    static let prefix = "checklist:"

    static func key(_ airplane: String, _ kind: ChecklistKind) -> String {
        "\(prefix)\(airplane.uppercased()):\(kind.rawValue)"
    }

    /// The airplane a plan flies, as its checklists are kept: its
    /// N-number, else its type's profile.
    @MainActor static func airplane(of plan: Plan) -> String {
        (plan.tail ?? plan.aircraft).uppercased()
    }

    /// Empty where nothing is written yet: the app starts no list itself.
    static func text(for airplane: String, _ kind: ChecklistKind, in defaults: UserDefaults = .standard) -> String {
        defaults.string(forKey: key(airplane, kind)) ?? ""
    }

    static func save(_ text: String, for airplane: String, _ kind: ChecklistKind, in defaults: UserDefaults = .standard) {
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            defaults.removeObject(forKey: key(airplane, kind))
        } else {
            defaults.set(text, forKey: key(airplane, kind))
        }
    }
}

/// One checklist's screen: the text kept, the list read from it by the
/// engine (ChecklistText), the ticks of this run, and the text being
/// written while it is.
@MainActor
@Observable
final class ChecklistModel {
    let airplane: String
    let kind: ChecklistKind
    @ObservationIgnored private let defaults: UserDefaults
    private(set) var text: String
    private(set) var checklist: Checklist
    /// Ticked items by section and item index; this run's only.
    private(set) var ticked: Set<String> = []
    /// The text in the editor; nil while the list is run.
    var writing: String?
    /// What the engine could not do with the text (read it into a list,
    /// or start it from the phases), for the screen to say.
    private(set) var problem: String?

    init(airplane: String, kind: ChecklistKind, defaults: UserDefaults = .standard) {
        self.airplane = airplane.uppercased()
        self.kind = kind
        self.defaults = defaults
        let text = LocalChecklists.text(for: airplane, kind, in: defaults)
        self.text = text
        checklist = Checklist(sections: [])
        read()
    }

    /// The kept text read into the list; an empty list and the reason
    /// where the engine cannot read it.
    private func read() {
        do {
            checklist = text.isEmpty ? Checklist(sections: []) : try ChecklistText.parse(text)
            problem = nil
        } catch {
            checklist = Checklist(sections: [])
            problem = "Your checklist couldn't be read: \(error.localizedDescription)"
        }
    }

    var title: String { "\(airplane) \(kind.title)" }

    func isTicked(_ section: Int, _ item: Int) -> Bool { ticked.contains("\(section):\(item)") }

    func toggle(_ section: Int, _ item: Int) {
        let key = "\(section):\(item)"
        if ticked.contains(key) { ticked.remove(key) } else { ticked.insert(key) }
    }

    /// A section's items done, for "n of m" by its title.
    func done(in section: Int) -> Int {
        guard checklist.sections.indices.contains(section) else { return 0 }
        return checklist.sections[section].items.indices.filter { isTicked(section, $0) }.count
    }

    func startOver() { ticked = [] }

    func edit() { writing = text }

    /// The phases' headings in an empty editor, to write each one's items
    /// under; never over what the pilot has written.
    func startFromPhases() {
        guard (writing ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            writing = try ChecklistPhases.text(kind)
            problem = nil
        } catch {
            problem = "The phases couldn't be listed: \(error.localizedDescription)"
        }
    }

    func save() {
        guard let writing else { return }
        LocalChecklists.save(writing, for: airplane, kind, in: defaults)
        text = LocalChecklists.text(for: airplane, kind, in: defaults)
        read()
        ticked = []
        self.writing = nil
    }

    func cancel() { writing = nil }
}
