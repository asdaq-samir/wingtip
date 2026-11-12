import Foundation

/// The approaches a saved flight's track flew into its destination, for
/// the coach, as the web's coachDebriefs finds them: the field's
/// instrument approaches drawn by the planner from the FAA's CIFP
/// (/api/airport/{ident}/procedures/{id}), the track held to each by the
/// engine's approach_find (route's approach debrief: which approach it
/// flew, the result, and fix by fix how it was flown, AIM 1-1-9, 1-1-17,
/// 5-4-5 and 14 CFR 91.175), trimmed to what the engine's
/// proficiency_plan reads. Nothing is found or judged here.
enum CoachApproaches {
    /// A field's approaches drawn at most: the CIFP lists a dozen at a big one.
    static let mostApproaches = 6

    /// An approach debriefed, trimmed: its procedure as the chart names it
    /// ("ILS Y RWY 08"), its profile and findings (the
    /// result among them, in the engine's words), and the field's
    /// elevation for the 500 ft gate (AC 61-98D 2.1.4); nil elevation
    /// leaves the gate unchecked, never assumed.
    static func trimmed(_ a: EngineContract.ApproachDebrief, elevationFt: Double?, flownOn: String) -> CoachDebrief {
        CoachDebrief(
            elevationFt: elevationFt, findings: a.findings.map { APICoachFinding(text: $0.text, tone: $0.tone) },
            flownOn: flownOn, kind: "approach", legs: [], patterns: [], place: a.airport, procedure: a.name,
            profile: a.profile.track.map { APICoachProfilePoint(altFt: $0.altFt, off: $0.off, toGoNm: $0.toGoNm) })
    }

    /// The saved track's points as the engine reads them.
    static func points(_ track: SavedTrack) -> [EngineContract.TrackPoint] {
        track.points.map { EngineContract.TrackPoint(t: Double($0.t), lat: $0.lat, lon: $0.lon, altFt: $0.altFt) }
    }

    /// Each approach the track flew, one for each time it came down a
    /// final, debriefed by the engine; none where it flew none.
    static func found(_ drawings: [EngineContract.ProcedureDrawing], points: [EngineContract.TrackPoint],
                      elevationFt: Double?, flownOn: String) throws -> [CoachDebrief] {
        guard !drawings.isEmpty else { return [] }
        return try Engine.approachFind(drawings: drawings, points: points).map { trimmed($0, elevationFt: elevationFt, flownOn: flownOn) }
    }

    /// A procedure as the planner draws it, read as the engine's
    /// contract has it: the planner's own keys, passed on unchanged as
    /// the web passes them.
    static func drawing(_ data: Data) throws -> EngineContract.ProcedureDrawing {
        try Engine.decoder.decode(EngineContract.ProcedureDrawing.self, from: data)
    }

    /// A procedure as the planner draws it (/api/airport/{ident}/procedures/{id}),
    /// read as the engine's contract has it: the same members by name.
    static func drawing(_ ident: String, procedure: String, transition: String? = nil) async throws -> EngineContract.ProcedureDrawing {
        try Engine.recoded(try await Planner.procedure(ident, id: procedure, transition: transition))
    }

    /// The field's approaches, drawn; one that cannot be had is left out.
    static func drawings(_ ident: String) async -> [EngineContract.ProcedureDrawing] {
        guard let listed = try? await Planner.procedures(ident) else { return [] }
        var out: [EngineContract.ProcedureDrawing] = []
        for p in listed.procedures.filter({ $0.kind == "approach" }).prefix(mostApproaches) {
            if let d = try? await drawing(ident, procedure: p.id) { out.append(d) }
        }
        return out
    }

    /// The approaches the track flew into `destination`, debriefed and
    /// trimmed; none where the field's approaches or the engine cannot
    /// be had.
    static func fetch(destination: String, track: SavedTrack, flownOn: String) async -> [CoachDebrief] {
        let drawn = await drawings(destination)
        guard !drawn.isEmpty else { return [] }
        let elevation = (try? await Planner.place(destination))?.elevationFt
        return (try? found(drawn, points: points(track), elevationFt: elevation, flownOn: flownOn)) ?? []
    }
}
