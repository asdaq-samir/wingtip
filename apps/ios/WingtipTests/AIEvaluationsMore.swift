import Evaluations
import Foundation
@testable import Wingtip
import XCTest

/// The on-device AI added after the NOTAMs and the clearance, scored with
/// Apple's Evaluations framework on the shared fixtures as AIEvaluations
/// scores those: a logbook remark drafted from the entries of
/// logbookCsv.json, and why the plan flies its altitude from the cases of
/// altitude.json (the engine's legal_cruising_altitudes). Each runs Apple's
/// on-device model where the simulator or the phone has it, and is skipped
/// where it does not. What each scores is what the app promises: no
/// figure of the model's own (after the guard the app runs), words that
/// survive the guard at all, and the matter named.
final class AIEvaluationsMoreTests: XCTestCase {
    /// A figure of the model's own is a safety defect: every sample must
    /// keep to the figures. How often the words survive the guard, and
    /// name what they are about, is quality. On the iOS 27.2 simulator, at
    /// 30 samples or more (EvalBar), five runs on 2026-11-10 gave: a remark
    /// kept in 0.63 to 0.67 and naming a field in 0.53 to 0.63 (30 each);
    /// why this altitude kept and naming its rule in 0.53 to 0.66 (32
    /// each). The bars sit under the lowest of those by more than two of
    /// a run's sample-to-sample spreads (about 0.09 at 30).
    static let keptFloor = EvalBar.quality(device: 0.5, simulator: 0.35)
    static let namesFloor = EvalBar.quality(device: 0.5, simulator: 0.35)

    func testARemarkKeepsToTheEntry() async throws {
        try await EvalBar.modelOrSkip()
        let evaluation = RemarkEvaluation(samples: try EvalBar.asked(try RemarkEvaluation.samples()))
        let result = try await evaluation.run()
        print("EVAL \(Self.self).\(#function)\n\(result.groupedSummary)")
        XCTAssertEqual(result.aggregateValue(.mean(of: RemarkEvaluation.noInvented)), 1, result.groupedSummary)
        XCTAssertGreaterThanOrEqual(result.aggregateValue(.mean(of: RemarkEvaluation.kept)), Self.keptFloor, result.groupedSummary)
        XCTAssertGreaterThanOrEqual(result.aggregateValue(.mean(of: RemarkEvaluation.namesIt)), Self.namesFloor, result.groupedSummary)
    }

    func testWhyThisAltitudeKeepsToTheEnginesReasons() async throws {
        try await EvalBar.modelOrSkip()
        let evaluation = AltitudeWhyEvaluation(samples: try EvalBar.asked(try AltitudeWhyEvaluation.samples()))
        let result = try await evaluation.run()
        print("EVAL \(Self.self).\(#function)\n\(result.groupedSummary)")
        XCTAssertEqual(result.aggregateValue(.mean(of: AltitudeWhyEvaluation.noInvented)), 1, result.groupedSummary)
        XCTAssertGreaterThanOrEqual(result.aggregateValue(.mean(of: AltitudeWhyEvaluation.kept)), Self.keptFloor, result.groupedSummary)
        XCTAssertGreaterThanOrEqual(result.aggregateValue(.mean(of: AltitudeWhyEvaluation.namesIt)), Self.namesFloor, result.groupedSummary)
    }

    /// The samples are built from the fixtures and the metrics judge known
    /// answers right, with or without a model.
    func testTheNewEvaluationsJudgeKnownAnswers() throws {
        let remarks = try RemarkEvaluation.samples()
        let first = try XCTUnwrap(remarks.first)
        XCTAssertTrue(RemarkEvaluation.names("Cross-country KUGN to KRFD.", first))
        XCTAssertTrue(RemarkEvaluation.inventsNothing("Cross-country KUGN to KRFD, 2 landings.", first))
        XCTAssertFalse(RemarkEvaluation.inventsNothing("Cross-country KUGN to KRFD, 7 landings.", first))
        let altitudes = try AltitudeWhyEvaluation.samples()
        let a = try XCTUnwrap(altitudes.first)
        XCTAssertNotNil(AltitudeWhyEvaluation.reasons(a))
        XCTAssertTrue(AltitudeWhyEvaluation.names("Eastbound, so an odd thousand plus 500.", a))
    }
}

/// A logbook remark: each sample an entry of logbookCsv.json's export, as
/// JSON; held to its route's fields.
struct RemarkEvaluation: Evaluation {
    static let noInvented = Metric("no figure of its own")
    static let kept = Metric("a remark survives the guard")
    static let namesIt = Metric("names a field of the route")

    let samples: [TextSample]
    var dataset: ArrayLoader<TextSample> { ArrayLoader(samples: samples) }

    static func samples() throws -> [TextSample] {
        let fixture = try EvalFixtures.load("logbookCsv")
        var out: [TextSample] = []
        for case let export as [String: Any] in fixture["export"] as? [Any] ?? [] {
            for case let entry as [String: Any] in export["entries"] as? [Any] ?? [] {
                guard let route = entry["route"] as? String, !route.isEmpty,
                      let data = try? JSONSerialization.data(withJSONObject: entry) else { continue }
                out.append(TextSample(input: String(decoding: data, as: UTF8.self), expected: route.split(separator: " ").joined(separator: "|")))
            }
        }
        return out
    }

    static func figures(_ sample: TextSample) -> [WordsSource] {
        (try? JSONDecoder().decode(LogbookEntryRequest.self, from: Data(sample.input.utf8))).map(RemarkDraft.figures) ?? []
    }

    static func names(_ said: String, _ sample: TextSample) -> Bool {
        (sample.expected ?? "").split(separator: "|").contains { said.uppercased().contains($0.uppercased()) }
    }

    static func inventsNothing(_ said: String, _ sample: TextSample) -> Bool {
        NumberGuard.invented(said, given: figures(sample).map(\.text)).isEmpty
    }

    func subject(from sample: TextSample) async throws -> ModelSubject<String> {
        switch await RemarkDraft.draft(Self.figures(sample)) {
        case .success(let remark): ModelSubject(value: remark)
        case .failure: ModelSubject(value: "")
        }
    }

    var evaluators: Evaluators {
        Evaluator<TextSample> { sample, subject in
            Self.inventsNothing(subject.value, sample) ? Self.noInvented.passing() : Self.noInvented.failing(rationale: subject.value)
        }
        Evaluator<TextSample> { _, subject in
            subject.value.isEmpty ? Self.kept.failing(rationale: "nothing passed") : Self.kept.passing()
        }
        Evaluator<TextSample> { sample, subject in
            Self.names(subject.value, sample) ? Self.namesIt.passing() : Self.namesIt.failing(rationale: subject.value)
        }
    }

    func aggregateMetrics(using aggregator: inout MetricsAggregator) {
        aggregator.computeMean(of: Self.noInvented)
        aggregator.computeMean(of: Self.kept)
        aggregator.computeMean(of: Self.namesIt)
    }
}

/// Why this altitude: each sample a case of altitude.json's legal
/// altitudes (the floor, the ceiling, the magnetic course, the rules), a
/// plan flying its middle legal altitude; held to saying the direction of
/// flight or the rule it gives.
struct AltitudeWhyEvaluation: Evaluation {
    static let noInvented = Metric("no figure of its own")
    static let kept = Metric("the model's words survive the guard")
    static let namesIt = Metric("names the direction or the rule")

    let samples: [TextSample]
    var dataset: ArrayLoader<TextSample> { ArrayLoader(samples: samples) }

    static func samples() throws -> [TextSample] {
        let fixture = try EvalFixtures.load("altitude")
        return (fixture["legal"] as? [[String: Any]] ?? []).compactMap { c in
            guard let input = c["input"], let data = try? JSONSerialization.data(withJSONObject: ["input": input, "first": c["first"] ?? []]) else { return nil }
            return TextSample(input: String(decoding: data, as: UTF8.self), expected: "eastbound|westbound|91.159|91.179|odd|even")
        }
    }

    /// The case as the planner's altitude line, its middle legal altitude flown.
    static func reasons(_ sample: TextSample) -> AltitudeWhy.Reasons? {
        guard let object = try? JSONSerialization.jsonObject(with: Data(sample.input.utf8)) as? [String: Any],
              let input = object["input"] as? [String: Any], let legal = object["first"] as? [Double], !legal.isEmpty,
              let floor = input["floor_ft"] as? Double, let course = input["magnetic_course_deg"] as? Double else { return nil }
        let flown = legal[legal.count / 2]
        let selection = AltitudeSelection(airspaceTransits: [], bandCeilingFt: input["ceiling_ft"] as? Double, candidatesFt: legal,
                                          courseMagneticDeg: course, eastbound: (try? Engine.isEastbound(magneticCourseDeg: course)) ?? false, floorFt: floor, hazards: [],
                                          hemisphericRuleFromFt: input["rule_from_ft"] as? Double, recommendedFt: flown, rules: input["rules"] as? String ?? "vfr")
        let option = AltitudeOption(eteMin: 64, fuelGal: 9.1, kind: "fastest", legsWithoutWind: 0, needsOxygen: false,
                                    steps: [AltitudeStep(altitudeFt: flown, distanceNm: 96, from: "KMSN", to: "KDLH")], tailwindKt: 8, unflyableLegs: 0)
        return AltitudeWhy.reasons(NavLogAltitude(altitudeFt: flown, altitudeSelection: selection, flown: "fastest", options: [option]), flownFt: nil, choice: nil)
    }

    static func names(_ said: String, _ sample: TextSample) -> Bool {
        (sample.expected ?? "").split(separator: "|").contains { said.lowercased().contains($0) }
    }

    func subject(from sample: TextSample) async throws -> ModelSubject<String> {
        guard let reasons = Self.reasons(sample) else { return ModelSubject(value: "engine|") }
        let answer = await AltitudeWhy.said(reasons)
        let given = answer.words.sources.map(\.text)
        let text = answer.words.sentences.map(\.text).joined(separator: " ")
        // The figures the words rest on travel with them, for the judge.
        let json = (try? JSONEncoder().encode(given)).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
        return ModelSubject(value: "\(answer.origin == .device ? "device" : "engine")|\(text)|\(json)")
    }

    private static func parts(_ value: String) -> (device: Bool, text: String, given: [String]) {
        let p = value.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
        let given = p.count > 2 ? (try? JSONDecoder().decode([String].self, from: Data(p[2].utf8))) ?? [] : []
        return (p.first == "device", p.count > 1 ? p[1] : "", given)
    }

    var evaluators: Evaluators {
        Evaluator<TextSample> { _, subject in
            let p = Self.parts(subject.value)
            return NumberGuard.invented(p.text, given: p.given).isEmpty ? Self.noInvented.passing() : Self.noInvented.failing(rationale: p.text)
        }
        Evaluator<TextSample> { _, subject in
            Self.parts(subject.value).device ? Self.kept.passing() : Self.kept.failing(rationale: "the engine's own words were given")
        }
        Evaluator<TextSample> { sample, subject in
            let p = Self.parts(subject.value)
            return p.device && Self.names(p.text, sample) ? Self.namesIt.passing() : Self.namesIt.failing(rationale: p.text)
        }
    }

    func aggregateMetrics(using aggregator: inout MetricsAggregator) {
        aggregator.computeMean(of: Self.noInvented)
        aggregator.computeMean(of: Self.kept)
        aggregator.computeMean(of: Self.namesIt)
    }
}
