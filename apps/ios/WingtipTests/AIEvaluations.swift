import Evaluations
import Foundation
import FoundationModels
@testable import Wingtip
import XCTest

/// The on-device AI scored on the shared aviation fixtures with Apple's
/// Evaluations framework (Xcode 27, WWDC26 "Meet the Evaluations
/// framework"): the NOTAMs in words (notamsRanked.json, the engine's own
/// ranking and reasons) and a clearance said back for the engine's reader
/// (clearances.json, the recognizer's words and the engine's reading).
/// Each runs Apple's on-device model where the simulator or the phone has
/// it, and is skipped where it does not; what each scores is what the
/// app's rules promise: no figure of the model's own, the matter named,
/// and the engine reading the same clearance from the model's words.
final class AIEvaluationsTests: XCTestCase {
    /// The share of samples each metric must pass, at the least. A figure
    /// of the model's own is a safety defect, so every sample must keep to
    /// the figures. The rest are quality. On a phone they are held where
    /// they have got to. On the iOS 27.2 simulator, at 30 samples or more
    /// (EvalBar), five runs on 2026-11-10 gave: the NOTAMs' words named
    /// what each NOTAM does in 0.60 to 0.77 of samples (30 each), the bar
    /// 0.5; the clearance said back read the same in 0.79 to 0.90 (39
    /// each), the bar 0.7, where 0.75 sat within one sample-to-sample
    /// spread of the lowest run.
    static let floor = EvalBar.quality(device: 0.8, simulator: 0.7)
    static let namesFloor = EvalBar.quality(device: 0.8, simulator: 0.5)

    /// Skipped where the model is said to be unavailable, and also where it
    /// is said to be available but cannot answer: GitHub's macOS runner's
    /// simulator reports `.available` yet holds none of the model's assets
    /// (UnifiedAssetFramework 5000, ModelManagerError 1026, CI run
    /// 43517308483), so every sample came back empty and scored 0.
    private func modelOrSkip() async throws {
        if let why = OnDeviceWords.unavailableWhy { throw XCTSkip("No on-device model here: \(why)") }
        do {
            _ = try await LanguageModelSession().respond(to: "Say OK.")
        } catch {
            throw XCTSkip("The on-device model cannot answer here: \(error.localizedDescription)")
        }
    }

    func testTheNotamsInWordsKeepToTheNotams() async throws {
        try await modelOrSkip()
        let evaluation = NotamWordsEvaluation(samples: try EvalBar.asked(try NotamWordsEvaluation.samples()))
        let result = try await evaluation.run()
        print("EVAL \(Self.self).\(#function)\n\(result.groupedSummary)")
        XCTAssertEqual(result.aggregateValue(.mean(of: NotamWordsEvaluation.noInvented)), 1, result.groupedSummary)
        XCTAssertGreaterThanOrEqual(result.aggregateValue(.mean(of: NotamWordsEvaluation.namesIt)), Self.namesFloor, result.groupedSummary)
    }

    func testAClearanceSaidBackReadsTheSame() async throws {
        try await modelOrSkip()
        let evaluation = ClearanceSaidEvaluation(samples: try EvalBar.asked(try ClearanceSaidEvaluation.samples()))
        let result = try await evaluation.run()
        print("EVAL \(Self.self).\(#function)\n\(result.groupedSummary)")
        XCTAssertGreaterThanOrEqual(result.aggregateValue(.mean(of: ClearanceSaidEvaluation.sameReading)), Self.floor, result.groupedSummary)
    }

    /// The fixtures' own checks, run everywhere, with or without a model:
    /// the samples are built and the metrics judge known answers right.
    func testTheEvaluationsJudgeKnownAnswers() throws {
        let samples = try NotamWordsEvaluation.samples()
        XCTAssertTrue(samples.contains { $0.expected?.contains("runway") == true })
        let runway = try XCTUnwrap(samples.first { $0.expected?.contains("runway") == true })
        XCTAssertTrue(NotamWordsEvaluation.names("Runway 18/36 at KOSH is closed while you are there.", runway))
        XCTAssertTrue(NotamWordsEvaluation.inventsNothing("Runway 18/36 at KOSH is closed.", runway))
        XCTAssertFalse(NotamWordsEvaluation.inventsNothing("Runway 18/36 is closed for 45 minutes.", runway))
        // Two samples are too few however often they are asked; a set is
        // asked over to the simulator's count, each sample alike.
        XCTAssertThrowsError(try EvalBar.asked(Array(samples.prefix(2))))
        let asked = try EvalBar.asked(samples)
        XCTAssertGreaterThanOrEqual(asked.count, EvalBar.onSimulator ? EvalBar.simulatorSamples : samples.count)
        XCTAssertEqual(asked.count % samples.count, 0)
        let clearances = try ClearanceSaidEvaluation.samples()
        let first = try XCTUnwrap(clearances.first)
        XCTAssertEqual(ClearanceSaidEvaluation.reading(of: first.input), first.expected)
    }
}

/// The quality bars and sample counts the evaluations hold, by where they
/// run. Apple's on-device model on the simulator is the same model but
/// answers less steadily than on a phone: on the iOS 27.2 simulator
/// (2026-11-09) the NOTAMs' words named their matter in anything from 2 to
/// 5 of 6 samples, run to run, and a remark survived the guard in 1 to 2
/// of 3. Scored on so few, a mean moves by a sixth or a third with one
/// answer, and the bars failed now and then (three runs of 2026-11-09).
/// So on the simulator every
/// set is asked over until it has `simulatorSamples`, where one answer
/// moves the mean by a thirtieth, and each quality bar sits under the
/// lowest of five such runs (the commit that set them has the runs); on a
/// phone the sets are asked once and the bars are as they were. The
/// safety bar, no figure of the model's own, is 1 everywhere, whatever the
/// sample count. A run with fewer than `leastSamples` fails rather than
/// passing on nothing.
enum EvalBar {
    static var onSimulator: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        false
        #endif
    }

    /// The fewest samples a score is taken on: never none.
    static let leastSamples = 3

    static func quality(device: Double, simulator: Double) -> Double { onSimulator ? simulator : device }

    /// The fewest samples a quality score is taken on on the simulator.
    static let simulatorSamples = 30

    /// The samples as asked: on the simulator the whole set over and over,
    /// each sample as often as the next, until there are
    /// `simulatorSamples` of them; once on a phone.
    static func runs(_ samples: [TextSample]) -> [TextSample] {
        guard onSimulator, !samples.isEmpty else { return samples }
        let times = (simulatorSamples + samples.count - 1) / samples.count
        return Array(repeating: samples, count: times).flatMap { $0 }
    }

    /// A fixture's samples as asked (`runs`), or an error where it has
    /// fewer than `leastSamples` of its own: counted before they are asked
    /// over, so one sample asked thirty times is still too few.
    static func asked(_ samples: [TextSample]) throws -> [TextSample] {
        guard samples.count >= leastSamples else { throw TooFewSamples(count: samples.count) }
        return runs(samples)
    }

    struct TooFewSamples: Error, CustomStringConvertible {
        let count: Int
        var description: String { "too few samples to score: \(count), where \(EvalBar.leastSamples) is the least" }
    }
}

/// A sample of words to judge: the input as text (CustomStringConvertible,
/// as the framework asks), and what the answer is held to.
struct TextSample: SampleProtocol {
    var input: String
    var expected: String?
}

/// The fixtures, as the test bundle carries them (project.yml).
enum EvalFixtures {
    private final class Bundled {}

    static func load(_ name: String) throws -> [String: Any] {
        guard let url = Bundle(for: Bundled.self).url(forResource: name, withExtension: "json"),
              let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        else { throw CocoaError(.fileNoSuchFile) }
        return object
    }
}

/// The NOTAMs in words: each sample one ranked NOTAM, as sent with the
/// engine's reasons (NotamsInWords.figure), and the words it must name.
struct NotamWordsEvaluation: Evaluation {
    static let noInvented = Metric("no figure of its own")
    static let namesIt = Metric("names what the NOTAM does")

    let samples: [TextSample]
    var dataset: ArrayLoader<TextSample> { ArrayLoader(samples: samples) }

    /// What a NOTAM is about, by its words as sent, and the words a plain
    /// sentence about it must use one of.
    static let matters: [(String, [String])] = [
        ("RWY", ["runway"]), ("TWY", ["taxiway"]), ("FUEL", ["fuel"]),
        ("PARACHUTE", ["parachute", "jump"]), ("TFR", ["tfr", "flight restriction"]),
    ]

    static func samples() throws -> [TextSample] {
        let fixture = try EvalFixtures.load("notamsRanked")
        var out: [TextSample] = []
        for case let c as [String: Any] in fixture["cases"] as? [Any] ?? [] {
            let input = c["input"] as? [String: Any] ?? [:]
            let raw = Dictionary(((input["notams"] as? [[String: Any]]) ?? []).compactMap { n in
                (n["id"] as? String).map { ($0, n["text"] as? String ?? "") }
            }, uniquingKeysWith: { a, _ in a })
            for case let r as [String: Any] in (c["answer"] as? [String: Any])?["ranked"] as? [Any] ?? [] {
                guard let id = r["id"] as? String, let text = raw[id] else { continue }
                let reasons = (r["reasons"] as? [[String: Any]] ?? []).compactMap { $0["words"] as? String }
                let figure = NotamsInWords.figure(id: id, raw: text, reasons: reasons)
                guard let words = matters.first(where: { text.uppercased().contains($0.0) })?.1,
                      let json = try? String(decoding: JSONEncoder().encode([figure]), as: UTF8.self) else { continue }
                out.append(TextSample(input: json, expected: words.joined(separator: "|")))
            }
        }
        return out
    }

    static func figures(_ sample: TextSample) -> [WordsSource] {
        (try? JSONDecoder().decode([WordsSource].self, from: Data(sample.input.utf8))) ?? []
    }

    static func names(_ said: String, _ sample: TextSample) -> Bool {
        (sample.expected ?? "").split(separator: "|").contains { said.lowercased().contains($0) }
    }

    static func inventsNothing(_ said: String, _ sample: TextSample) -> Bool {
        NumberGuard.invented(said, given: figures(sample).map(\.text)).isEmpty
    }

    func subject(from sample: TextSample) async throws -> ModelSubject<String> {
        let said = await NotamsInWords.said(Self.figures(sample))
        return ModelSubject(value: said.words.sentences.map(\.text).joined(separator: " "))
    }

    var evaluators: Evaluators {
        Evaluator<TextSample> { sample, subject in
            Self.inventsNothing(subject.value, sample) ? Self.noInvented.passing() : Self.noInvented.failing(rationale: subject.value)
        }
        Evaluator<TextSample> { sample, subject in
            Self.names(subject.value, sample) ? Self.namesIt.passing() : Self.namesIt.failing(rationale: subject.value)
        }
    }

    func aggregateMetrics(using aggregator: inout MetricsAggregator) {
        aggregator.computeMean(of: Self.noInvented)
        aggregator.computeMean(of: Self.namesIt)
    }
}

/// A clearance said back by the on-device model, read by the engine: each
/// sample a recognizer's words (clearances.json `read`), held to the
/// engine's reading of those words -- the altitude, the expect, the
/// frequency and the squawk -- so the model's words change nothing the
/// engine reads.
struct ClearanceSaidEvaluation: Evaluation {
    static let sameReading = Metric("the engine reads the same clearance")

    let samples: [TextSample]
    var dataset: ArrayLoader<TextSample> { ArrayLoader(samples: samples) }

    static func samples() throws -> [TextSample] {
        let fixture = try EvalFixtures.load("clearances")
        return (fixture["read"] as? [[String: Any]] ?? []).compactMap { r in
            guard let heard = r["heard"] as? String, let reading = reading(of: heard) else { return nil }
            return TextSample(input: heard, expected: reading)
        }
    }

    /// The figures the engine reads from a clearance's words, as one line.
    static func reading(of text: String) -> String? {
        guard let c = try? Engine.readClearance(text: text) else { return nil }
        return [c.maintainFt.map { "maintain \($0)" }, c.expectFt.map { "expect \($0)" },
                c.frequency.map { "frequency \($0)" }, c.squawk.map { "squawk \($0)" }]
            .compactMap { $0 }.joined(separator: ", ")
    }

    func subject(from sample: TextSample) async throws -> ModelSubject<String> {
        let said = try await OnDeviceDocumentReader.said(clearance: sample.input) ?? sample.input
        return ModelSubject(value: Self.reading(of: said) ?? "")
    }

    var evaluators: Evaluators {
        Evaluator<TextSample> { sample, subject in
            subject.value == sample.expected ? Self.sameReading.passing()
                : Self.sameReading.failing(rationale: "\(subject.value) against \(sample.expected ?? "")")
        }
    }

    func aggregateMetrics(using aggregator: inout MetricsAggregator) {
        aggregator.computeMean(of: Self.sameReading)
    }
}
