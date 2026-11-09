import Foundation

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

extension CoachAsk {
    /// The ask as the planner reads it. Its keys are of two cases: the
    /// logbook entries and the gateway's dates camelCase, as the app has
    /// them from GET /api/logbook, and the debriefs the engine's own
    /// snake case (app/schemas/coach.py). Only what is under "debriefs" is
    /// written in snake case, so the one encoder suits both.
    func body() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        encoder.keyEncodingStrategy = .custom { path in
            let key = path.last!
            guard path.first?.stringValue == "debriefs", key.intValue == nil else { return key }
            return SnakeKey(Self.snake(key.stringValue))
        }
        return try encoder.encode(self)
    }

    /// "toGoNm" as "to_go_nm".
    static func snake(_ key: String) -> String {
        key.reduce(into: "") { out, c in
            if c.isUppercase { out += "_" + c.lowercased() } else { out.append(c) }
        }
    }
}

private struct SnakeKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ string: String) { stringValue = string }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

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
    var words: @Sendable (Data) async throws -> CoachWords

    /// Through the gateway, with the pilot's session and its CSRF token,
    /// as both are the pilot's own and signed in.
    static let gateway = CoachCalls(
        plan: { ask in
            let raw = try await post("/api/pilot/coach", try ask.body())
            return CoachPlanned(plan: try Planner.snakeCase.decode(ProficiencyPlan.self, from: raw), raw: raw)
        },
        words: { plan in try Planner.snakeCase.decode(CoachWords.self, from: try await post("/api/words/coach", plan)) })

    private static func post(_ path: String, _ body: Data) async throws -> Data {
        var request = try await Planner.request("POST", path, json: nil, csrf: true)
        request.httpBody = body
        return try await Planner.data(for: request)
    }
}
