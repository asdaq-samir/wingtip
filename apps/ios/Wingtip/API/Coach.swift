import Foundation
import OpenAPIRuntime

// The coach's two asks, through the gateway's /api/planner proxy as the
// web app's coachApi makes them: the pilot's proficiency plan from the
// planner (POST /api/pilot/coach, the engine's proficiency_plan: what is
// due and when, what their debriefs show, the sessions), then the plan in
// words from the assistant (POST /api/words/coach). The shapes are the
// services' own, generated from their documents; the app decides nothing
// in them.

typealias CoachAsk = APICoachAsk
typealias CoachDebrief = APICoachDebrief
typealias ProficiencyPlan = APIProficiencyPlan
typealias CoachSession = APICoachSession
typealias CoachDue = APICoachDue
typealias CoachWords = ASCoachWordsAnswer

/// The plan as the planner answered it: read, and its own bytes, which go
/// to the assistant unchanged (as the web app sends it), so the words are
/// asked of the very plan on screen.
struct CoachPlanned: Sendable {
    var plan: ProficiencyPlan
    var raw: Data
}

/// The two calls the coach makes, as the model takes them, so a test can
/// answer them without a server.
struct CoachCalls: Sendable {
    var plan: @Sendable (CoachAsk) async throws -> CoachPlanned
    /// The plan in Claude's words (the assistant's), or nil where the
    /// server's Claude features are off: the engine's plan then stands
    /// alone, with nothing said of words to come (ServerFeatures, the
    /// owner's decision of 2026-11-10 in docs/decisions).
    var words: (@Sendable (Data) async throws -> CoachWords)?

    /// Through the gateway, with the pilot's session and its CSRF token,
    /// as both are the pilot's own and signed in; the words only while
    /// the server's Claude features are this pilot's.
    static var gateway: CoachCalls {
        var calls = server
        if !ServerFeatures.claudeOnNow { calls.words = nil }
        return calls
    }

    /// The ask as the planner reads it: its keys are of two cases, the
    /// logbook entries and the gateway's dates camelCase, the debriefs the
    /// engine's own snake case (app/schemas/coach.py), each named by the
    /// generated type. The plan's bytes are the plan as read, which go to
    /// the assistant as the open object its document takes.
    private static let server = CoachCalls(
        plan: { ask in
            let plan = try await Planner.call { try await $0.coachPlan(body: .json(ask)).ok.body.json }
            return CoachPlanned(plan: plan, raw: try JSONEncoder().encode(plan))
        },
        words: { plan in
            let asked = try JSONDecoder().decode(OpenAPIObjectContainer.self, from: plan)
            return try await Planner.ask { try await $0.coachWords(body: .json(.init(additionalProperties: asked))).ok.body.json }
        })
}
