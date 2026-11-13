import Foundation

// The coach's ask, through the gateway's /api/planner proxy as the web
// app's coachApi makes it: the pilot's proficiency plan from the planner
// (POST /api/pilot/coach, the engine's proficiency_plan: what is due and
// when, what their debriefs show, the sessions). The shapes are the
// planner's own, generated from its document; the app decides nothing in
// them.

typealias CoachAsk = APICoachAsk
typealias CoachDebrief = APICoachDebrief
typealias ProficiencyPlan = APIProficiencyPlan
typealias CoachSession = APICoachSession
typealias CoachDue = APICoachDue

/// The call the coach makes, as the model takes it, so a test can answer
/// it without a server.
struct CoachCalls: Sendable {
    var plan: @Sendable (CoachAsk) async throws -> ProficiencyPlan

    /// Through the gateway, with the pilot's session and its CSRF token,
    /// as the plan is the pilot's own and signed in. The ask's keys are of
    /// two cases, the logbook entries and the gateway's dates camelCase,
    /// the debriefs the engine's own snake case (app/schemas/coach.py),
    /// each named by the generated type.
    static let gateway = CoachCalls(plan: { ask in
        try await Planner.call { try await $0.coachPlan(body: .json(ask)).ok.body.json }
    })
}
