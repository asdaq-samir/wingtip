import Foundation

/// The Go / No-Go at a glance, the owner's rule for every brief
/// (2026-11-03): the verdict, then at most three one-sentence lines a
/// pilot acts on, the rest in one row. Which findings make the lines, how
/// each is worded and cut, and the folded row's words are the engine's
/// (`gonogo_glance_lines`, engine/crates/brief/src/gonogo/glance.rs), the
/// rule the web's glance asks too, so the iPhone, the iPad and the web say
/// the same answer the same way. This only asks it of the planner's
/// answer (GoNoGoAnswer) and finds each line's finding again.
struct Glance: Equatable {
    /// One line of the glance: the finding it is, and the sentence.
    struct Line: Equatable, Identifiable, Sendable {
        let key: String
        let finding: String
        let words: String
        var id: String { key }
    }

    /// The lines, worst first.
    let lines: [Line]
    /// The findings the lines are of, in their order.
    let acted: [VerdictItem]
    /// The findings folded into one row, and its words; nil where the
    /// lines said everything.
    let rest: [VerdictItem]
    let restWords: String?
    /// The row's finding: the worst of those folded into it.
    let restFinding: String

    /// The glance of an answer, the engine asked once per answer rather
    /// than at every redraw of a view showing it (the strip's head redraws
    /// as the in-flight figures tick): the last answer's kept beside it.
    static func of(_ answer: GoNoGoAnswer) -> Glance {
        if let last, last.answer == answer { return last.glance }
        let made = Glance(answer)
        last = (answer, made)
        return made
    }

    private static var last: (answer: GoNoGoAnswer, glance: Glance)?

    init(_ answer: GoNoGoAnswer) {
        let items = answer.items.map {
            EngineContract.GonogoItem(key: $0.key, label: $0.label, tab: $0.tab, section: $0.section, finding: $0.finding, detail: $0.detail)
        }
        let byKey = Dictionary(answer.items.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        guard let glance = try? Engine.gonogoGlanceLines(items: items) else {
            // The engine could not be asked: every finding in the one row,
            // where the pilot opens each, never a line of our own making.
            lines = []
            acted = []
            rest = answer.items
            restWords = answer.items.isEmpty ? nil : String(localized: "Every finding")
            restFinding = answer.line.finding
            return
        }
        lines = glance.act.map { Line(key: $0.key, finding: $0.finding, words: $0.line) }
        acted = glance.act.compactMap { byKey[$0.key] }
        rest = glance.rest.items.compactMap { byKey[$0.key] }
        restWords = glance.rest.line.isEmpty ? nil : glance.rest.line
        restFinding = glance.rest.finding
    }
}
