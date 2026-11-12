import Foundation
import FoundationModels

/// The Brief at a glance when the planner's words cannot be had: the
/// verdict and at most three things to act on (docs/decisions/0012, the
/// owner's look-and-go rule), from the Go / No-Go's own findings the app
/// holds. Apple's on-device model words it by guided generation
/// (BriefGlanceAnswer); the finding must be the verdict's, each action
/// must name a finding acted on, and every number must be in that
/// finding's words, or the engine's own glance (Glance) is shown instead.
struct BriefSummary: Equatable, Sendable {
    struct Action: Equatable, Identifiable, Sendable {
        /// The finding it rests on ("fuel", "weather").
        let key: String
        let words: String
        var id: String { key }
    }

    /// The verdict's finding: "ok", "caution", "stop", "pending", "unknown".
    let finding: String
    let verdict: String
    let actions: [Action]
    let origin: AskOrigin
    var why: String?

    /// What is said aloud: the verdict, then each action.
    var spoken: String { ([verdict] + actions.map(\.words)).map { $0.hasSuffix(".") ? $0 : $0 + "." }.joined(separator: " ") }

    /// The engine's glance as it is: the planner's verdict line and the
    /// first three findings acted on, each in its own words (Glance).
    static func engine(_ answer: GoNoGoAnswer, why: String?) -> BriefSummary {
        BriefSummary(finding: answer.line.finding, verdict: answer.line.words,
                     actions: Glance.lines(answer).map { Action(key: $0.key, words: $0.words) }, origin: .engine, why: why)
    }

    /// The model's draft held to the findings, or nil where it strays: a
    /// finding other than the verdict's, no action where there is one to
    /// take. An action naming a finding not acted on, a second for one
    /// finding, or quoting a number its finding does not, is dropped; a
    /// verdict sentence quoting a number of its own is replaced by the
    /// planner's line.
    static func checked(_ draft: BriefGlanceDraft, answer: GoNoGoAnswer) -> BriefSummary? {
        guard draft.finding == answer.line.finding else { return nil }
        let acted = Glance.acted(answer)
        var kept: [Action] = []
        for action in draft.actions {
            let text = action.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty, !kept.contains(where: { $0.key == action.finding }),
                  let item = acted.first(where: { $0.key == action.finding }),
                  NumberGuard.invented(text, given: [item.label, item.detail]).isEmpty else { continue }
            kept.append(Action(key: item.key, words: text))
            if kept.count == Glance.most { break }
        }
        if kept.isEmpty, !acted.isEmpty { return nil }
        let verdict = draft.verdict.trimmingCharacters(in: .whitespacesAndNewlines)
        let given = [answer.line.words] + answer.items.flatMap { [$0.label, $0.detail] }
        let said = verdict.isEmpty || !NumberGuard.invented(verdict, given: given).isEmpty ? answer.line.words : verdict
        return BriefSummary(finding: answer.line.finding, verdict: said, actions: kept, origin: .device)
    }
}

/// What the model gives back, as plain values (the @Generable answer's).
struct BriefGlanceDraft: Equatable, Sendable {
    struct Action: Equatable, Sendable {
        let finding: String
        let text: String
    }

    let finding: String
    let verdict: String
    let actions: [Action]
}

/// The guided shape Apple's model fills in for the Brief's glance.
@Generable
struct BriefGlanceAnswer {
    @Generable
    struct Action {
        @Guide(description: "The key of the finding this action rests on, exactly as given in square brackets.")
        var finding: String
        @Guide(description: "One short sentence: what the pilot does about that finding, quoting its figures only as given.")
        var text: String
    }

    @Guide(description: "The verdict's finding, exactly as given.", .anyOf(["ok", "caution", "stop", "pending", "unknown"]))
    var finding: String
    @Guide(description: "The verdict in one short sentence, quoting only the verdict's own words and figures.")
    var verdict: String
    @Guide(description: "At most three actions, the most important first, one per finding that is not ok.", .maximumCount(3))
    var actions: [Action]

    var draft: BriefGlanceDraft {
        BriefGlanceDraft(finding: finding, verdict: verdict, actions: actions.map { .init(finding: $0.finding, text: $0.text) })
    }
}

/// The model behind the glance: Apple's, or a fake in a test.
protocol BriefGlanceModel: Sendable {
    var unavailableWhy: String? { get }
    func draft(_ answer: GoNoGoAnswer) async throws -> BriefGlanceDraft
}

struct AppleBriefGlanceModel: BriefGlanceModel {
    var unavailableWhy: String? { AppleModels.unavailableWhy }

    static let instructions = """
    You brief a pilot at a glance from a flight planner's Go / No-Go findings: the verdict, then at most three things to \
    act on, the worst first, each naming the finding it rests on by its key. Quote figures only as given; never compute, \
    round or add one. Never say the flight is safe: the decision is the pilot in command's.
    """

    /// The findings as the model reads them: the verdict, then each
    /// finding "[key] finding label: detail".
    static func prompt(_ answer: GoNoGoAnswer) -> String {
        let items = answer.items.map { "[\($0.key)] \($0.finding) \($0.label): \($0.detail)" }
        return "Verdict (\(answer.line.finding)): \(answer.line.words)\nFindings:\n\(items.joined(separator: "\n"))"
    }

    func draft(_ answer: GoNoGoAnswer) async throws -> BriefGlanceDraft {
        // The phone's model, else Apple's Private Cloud Compute (AppleModels).
        return try await AppleModels.attempt { place in
            try await AppleModels.session(place, instructions: Self.instructions)
                .respond(to: Self.prompt(answer), generating: BriefGlanceAnswer.self).content.draft
        }.value
    }
}

/// The glance: the model's, held to the findings, where it runs; else
/// the engine's, saying why.
struct BriefSummaryFor: Sendable {
    var model: any BriefGlanceModel = AppleBriefGlanceModel()

    func summary(_ answer: GoNoGoAnswer) async -> BriefSummary {
        if let why = model.unavailableWhy {
            Log.onDevice.info("the glance is the engine's: \(why, privacy: .public)")
            return .engine(answer, why: why)
        }
        do {
            if let checked = BriefSummary.checked(try await model.draft(answer), answer: answer) { return checked }
            return .engine(answer, why: "The model's words strayed from the findings, so the engine's are given.")
        } catch {
            Log.onDevice.notice("the on-device glance failed: \(error.localizedDescription, privacy: .public)")
            return .engine(answer, why: "Apple's on-device model could not write it.")
        }
    }
}
