import Foundation
import FoundationModels

/// "Why this altitude?" in plain words beside the altitude wheel: Apple's
/// on-device model explains the altitude the plan flies from the engine's
/// own reasons for it, which it fetches with tools (AltitudeWhyTools): the
/// direction of flight and the cruising-altitude rule (the engine's
/// is_eastbound and legal_cruising_altitudes; 14 CFR 91.159(a) VFR,
/// 91.179(b) IFR), the floor over terrain and obstacles (91.119; 91.177
/// under IFR), the airplane's ceiling, the clouds (91.155), Class B's shelf
/// (91.131), the freezing level and oxygen (91.211), the winds and fuel of
/// the planner's four plans, and the cautions on an altitude of the
/// pilot's own (own_altitude_caution). Every figure is the engine's or the
/// planner's; a sentence citing one not handed over, or quoting a number
/// none of its figures holds, is dropped (Words.checked, NumberGuard), and
/// where none is left the reasons are given in the engine's own words.
/// Hidden where the model cannot run.
enum AltitudeWhy {
    /// The figures, by the tool that hands them over.
    struct Reasons: Sendable {
        var flown: AskFigure
        var rule: [AskFigure] = []
        var limits: [AskFigure] = []
        var winds: [AskFigure] = []
        var cautions: [AskFigure] = []

        var all: [AskFigure] { [flown] + rule + limits + winds + cautions }
    }

    /// The reasons for the altitude flown, from the planner's altitude line
    /// (NavLogAltitude, worked out by the engine's select_cruise_altitude)
    /// and the engine on the phone; nil with no altitude.
    static func reasons(_ line: NavLogAltitude, flownFt: Double?, choice: String?) -> Reasons? {
        guard let flownFt = flownFt ?? line.altitudeFt else { return nil }
        let s = line.altitudeSelection
        let ifr = s.rules?.lowercased() == "ifr"
        let plan = choice ?? line.flown
        let named = plan.flatMap { $0.isEmpty || $0 == "custom" ? nil : "the \($0) plan" } ?? "your own altitude"
        var r = Reasons(flown: AskFigure(id: "altitude:flown", label: "The altitude flown", said: "The plan flies \(Format.altitude(flownFt)), \(named).",
                                         from: "The planner's altitude plans (the engine's select_cruise_altitude)"))
        // The direction of flight and the altitudes it gives, asked of the
        // engine on the phone; where it cannot answer, the planner's own
        // answer to the same rules (worked by the same engine on the server),
        // and where neither has the list, said as not known rather than none.
        let eastbound = (try? Engine.isEastbound(magneticCourseDeg: s.courseMagneticDeg)) ?? s.eastbound
        let legal = (try? Engine.legalCruisingAltitudes(floorFt: s.floorFt, ceilingFt: s.bandCeilingFt ?? s.serviceCeilingFt,
                                                        magneticCourseDeg: s.courseMagneticDeg, ruleFromFt: s.hemisphericRuleFromFt, rules: s.rules))
            ?? s.candidatesFt
        let rule = ifr ? "14 CFR 91.179(b)(1): below 18,000 ft MSL, odd thousands on a magnetic course of 0° through 179°, even thousands on 180° through 359°"
            : "14 CFR 91.159(a): more than 3,000 ft above the surface, odd thousands plus 500 ft on a magnetic course of 0° through 179°, even thousands plus 500 ft on 180° through 359°"
        let given: String
        switch legal {
        case nil: given = "; the cruising altitudes it gives here couldn't be worked out."
        case let list? where list.isEmpty: given = "; it gives no cruising altitude between the floor and the ceiling here."
        case let list?: given = "; the cruising altitudes it gives here are \(list.prefix(6).map { Format.altitude($0) }.joined(separator: ", "))."
        }
        r.rule.append(AskFigure(id: "rule:direction", label: "Direction of flight",
                                said: "The magnetic course is \(Format.heading(s.courseMagneticDeg)), \(eastbound ? "eastbound" : "westbound")" + given,
                                from: "\(rule) (the engine's legal_cruising_altitudes)"))
        r.limits.append(AskFigure(id: "limit:floor", label: "The floor", said: "The lowest altitude flown over the terrain and obstacles is \(Format.altitude(s.floorFt))\(s.mountainous == true ? ", over a mountainous area" : "").",
                                  from: ifr ? "14 CFR 91.177(a); Part 95's mountainous areas" : "14 CFR 91.119; Part 95's mountainous areas"))
        if let ft = s.serviceCeilingFt {
            r.limits.append(AskFigure(id: "limit:ceiling", label: "The airplane's ceiling", said: "The airplane's service ceiling is \(Format.altitude(ft)).", from: "The airplane's figures"))
        }
        if !ifr, let ft = s.cloudBaseFt {
            r.limits.append(AskFigure(id: "limit:clouds", label: "The clouds", said: "The forecast cloud base is \(Format.altitude(ft))\(s.cloudStation.map { " at \($0)" } ?? ""); the altitudes keep the cloud clearance under it.",
                                      from: "14 CFR 91.155; the planner's forecast"))
        }
        if let ft = s.airspaceCeilingFt {
            r.limits.append(AskFigure(id: "limit:classB", label: "Class B", said: "Class B's shelf over the route starts at \(Format.altitude(ft)).", from: "14 CFR 91.131; the FAA's airspace data"))
        }
        if let ft = s.freezingLevelFt {
            r.limits.append(AskFigure(id: "limit:freezing", label: "The freezing level", said: "The freezing level is \(Format.altitude(ft))\(s.icingPossible == true ? ", and icing is possible with the moisture forecast" : "").",
                                      from: "The planner's forecast (the engine's freezing_level)"))
        }
        for option in line.options ?? [] where !option.steps.isEmpty {
            guard let ft = option.altitudeFt else { continue }
            var parts = ["The \(option.kind) plan flies \(Format.altitude(ft))"]
            if let ete = option.eteMin { parts.append("in \(Format.duration(ete))") }
            if let gal = option.fuelGal { parts.append("on \(Format.fuel(gal))") }
            if let kt = option.tailwindKt { parts.append(kt >= 0 ? "with \(Format.speed(kt)) of tailwind" : "with \(Format.speed(-kt)) of headwind") }
            if option.needsOxygen { parts.append("and needs oxygen") }
            r.winds.append(AskFigure(id: "plan:\(option.kind)", label: "The \(option.kind) plan", said: parts.joined(separator: " ") + ".",
                                     from: option.needsOxygen ? "The planner's winds aloft and fuel; 14 CFR 91.211" : "The planner's winds aloft and fuel"))
        }
        for (i, c) in (line.cautions ?? []).enumerated() {
            r.cautions.append(AskFigure(id: "caution:\(i)", label: "\(c.fromIdent) to \(c.toIdent)",
                                        said: "At \(Format.altitude(c.altitudeFt)) from \(c.fromIdent) to \(c.toIdent): \(c.reasons.joined(separator: "; ")).",
                                        from: "The engine's own_altitude_caution"))
        }
        return r
    }

    /// The reasons said, or the engine's own words for them.
    static func said(_ reasons: Reasons, model: any AltitudeWhyModel = AppleAltitudeWhy()) async -> OnDeviceAnswer {
        let log = FigureLog()
        log.add([reasons.flown], by: "flown")
        do {
            let sentences = try await model.sentences(reasons, log: log)
            let words = NumberGuard.kept(Words.checked(sentences, sources: log.sources, model: OnDeviceWords.model, most: 6))
            if !words.sentences.isEmpty { return OnDeviceAnswer(words: words, origin: log.place == .cloud ? .cloud : .device) }
            return engine(reasons, why: "The model's words rested on no figure, so the engine's are given.")
        } catch {
            return engine(reasons, why: "Apple's on-device model could not answer.")
        }
    }

    /// The reasons, each the engine's own sentence citing itself.
    static func engine(_ reasons: Reasons, why: String) -> OnDeviceAnswer {
        let all = reasons.all
        let sentences = all.map { WordsSentence(sources: [$0.id], text: $0.said) }
        return OnDeviceAnswer(words: Words(model: "engine", sentences: sentences, sources: all.map(\.source), unavailable: nil), origin: .engine, why: why)
    }
}

/// The model that words the reasons: Apple's on the phone, or a fake in a
/// test (the simulator may have no model).
protocol AltitudeWhyModel: Sendable {
    func sentences(_ reasons: AltitudeWhy.Reasons, log: FigureLog) async throws -> [WordsSentence]
}

/// Apple's on-device model with the reasons as its tools.
struct AppleAltitudeWhy: AltitudeWhyModel {
    func sentences(_ reasons: AltitudeWhy.Reasons, log: FigureLog) async throws -> [WordsSentence] {
        // The altitude and its direction-of-flight rule are in the
        // prompt, as the first run of AltitudeWhyEvaluation found the
        // model seldom asked for the rule; the rest come by the tools.
        log.add(reasons.rule, by: "prompt")
        let given = ([reasons.flown] + reasons.rule).map(\.forModel).joined(separator: "\n")
        let prompt = "\(given)\nExplain why the plan flies this altitude: first the direction of flight and the cruising-altitude rule, then what the tools give."
        let instructions = OnDeviceWords.instructions(.altitude)
            + " Call the tools for the rest of the reasons: the limits, the plans' winds and fuel, and the cautions."
        // The phone's model, else Apple's Private Cloud Compute (AppleModels).
        let (sentences, place) = try await AppleModels.attempt { place in
            let session = AppleModels.session(place, tools: AltitudeWhyTools.all(reasons, log: log), instructions: instructions)
            return try await session.respond(to: prompt, generating: WordsAnswer.self).content.sentences.map { WordsSentence(sources: $0.sources, text: $0.text) }
        }
        log.place = place
        return sentences
    }
}
