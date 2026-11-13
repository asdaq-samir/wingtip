import Foundation
import FoundationModels
import os

/// The briefing and the Go / No-Go in a few plain sentences, each
/// resting on figures the pilot can read raw. The figures are always the
/// engine's or the planner's; the words are Apple's models' (on the
/// phone, or Apple's Private Cloud Compute; AppleModels). A sentence
/// cites the figures it rests on by their ids, and a sentence citing an
/// id it was not given is dropped: the model can cite wrongly, and a
/// sentence resting on nothing is not shown. The model is never asked
/// for a figure, and the screen's own figures are never touched: the
/// words are an addition above them.

/// One figure a sentence can rest on: its id ("metar:KMSN", "taf:KMSN",
/// "hazard:0", "finding:fuel"), the chip's label and the raw text the
/// chip opens.
struct WordsSource: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var label: String
    var text: String
}

/// One sentence and the ids of the figures it rests on.
struct WordsSentence: Codable, Hashable, Sendable {
    var sources: [String]
    var text: String
}

/// The words as the screens show them: the sentences, the most important
/// first; the sources they cite, in the order given; which model wrote
/// them; and, with no sentences, why not, in words.
struct Words: Codable, Hashable, Sendable {
    var model: String
    var sentences: [WordsSentence]
    var sources: [WordsSource]
    var unavailable: String?
}

extension Words {
    /// No words, and why.
    static func none(_ model: String, _ why: String) -> Words {
        Words(model: model, sentences: [], sources: [], unavailable: why)
    }

    /// The sentences every one of whose cited ids is a figure given, the
    /// first `most` of them, and the figures they cite in the order
    /// given; the rest dropped. A sentence citing nothing rests on nothing
    /// and goes too, as does one citing an id not given, however plausible
    /// it reads: the model can cite wrongly, and a sentence whose chip
    /// would open nothing is not shown.
    static func checked(_ sentences: [WordsSentence], sources: [WordsSource], model: String, most: Int = 10) -> Words {
        let given = Set(sources.map(\.id))
        var kept: [WordsSentence] = []
        for sentence in sentences {
            let text = sentence.text.trimmingCharacters(in: .whitespacesAndNewlines)
            var ids: [String] = []
            for id in sentence.sources.map({ $0.trimmingCharacters(in: .whitespaces) }) where !id.isEmpty && !ids.contains(id) { ids.append(id) }
            if !text.isEmpty, !ids.isEmpty, ids.allSatisfy(given.contains) {
                kept.append(WordsSentence(sources: ids, text: text))
            } else {
                Log.words.info("dropped a sentence citing \(ids.joined(separator: ","), privacy: .public)")
            }
        }
        kept = Array(kept.prefix(most))
        let cited = Set(kept.flatMap(\.sources))
        return Words(model: model, sentences: kept, sources: sources.filter { cited.contains($0.id) }, unavailable: nil)
    }

    /// A cited figure by its id, for a chip.
    func source(_ id: String) -> WordsSource? { sources.first { $0.id == id } }
}

/// Which words, and so which instructions the model is given: besides
/// the briefing's, a logbook entry's remark (RemarkDraft) and why the
/// plan flies its altitude (AltitudeWhy).
enum WordsKind: String, Sendable {
    case notams, weather, risk, debrief, changes, remark, altitude
}

/// What the words are asked for: their kind and the figures the phone
/// assembled for them (WordsFigures).
struct WordsAsk: Sendable {
    let kind: WordsKind
    let figures: [WordsSource]
}

/// Where the words came from, for the caption over them: the pilot
/// should know which model wrote what they read.
enum WordsOrigin: Equatable, Sendable {
    case device, cloud, none

    var caption: String {
        switch self {
        case .device: "On this iPhone"
        case .cloud: "Apple's Private Cloud Compute"
        case .none: "No words"
        }
    }

    /// Apple's words by the model that wrote them (ModelPlace).
    static func apple(_ words: Words) -> WordsOrigin { ModelPlace.of(model: words.model) == .cloud ? .cloud : .device }
}

/// Words with where they came from.
struct SaidWords: Equatable, Sendable {
    let words: Words
    let origin: WordsOrigin
}

/// A source of words: the device, or a fake in a test.
protocol WordsProvider: Sendable {
    func words(_ ask: WordsAsk) async throws -> Words
}

/// Why a provider gave no words, in words a pilot reads.
struct WordsUnavailable: Error, LocalizedError, Equatable {
    let why: String
    var errorDescription: String? { why }
}

// MARK: - The words on this iPhone

/// What the on-device model fills in: the sentences, each with the ids of
/// the figures it rests on. The ids are guided to be the ones given and
/// checked after (Words.checked), since a guide is advice to the model,
/// not a proof.
@Generable
struct WordsAnswer {
    @Generable
    struct Sentence {
        @Guide(description: "One short declarative sentence a pilot reads in the cockpit, quoting figures only as the figures give them.")
        var text: String
        @Guide(description: "The ids, exactly as given in the figures, of the figures this sentence rests on; at least one, and never an id not given.")
        var sources: [String]
    }

    @Guide(description: "The sentences, the most important first; no more than eight.")
    var sentences: [Sentence]
}

/// Apple's on-device model (FoundationModels, with Apple Intelligence
/// on): the words with no signal, from the figures the phone assembled,
/// which are the engine's and the planner's own. Refused in words on a
/// phone without Apple Intelligence, or while the model is still
/// downloading.
struct OnDeviceWords: WordsProvider {
    static let model = "apple-on-device"

    /// Why the model cannot answer here, else nil.
    static var unavailableWhy: String? {
        switch SystemLanguageModel.default.availability {
        case .available:
            return nil
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible: return "This iPhone cannot run Apple's on-device model."
            case .appleIntelligenceNotEnabled: return "Apple Intelligence is off in Settings."
            case .modelNotReady: return "Apple's on-device model is still downloading."
            @unknown default: return "Apple's on-device model is not available."
            }
        }
    }

    /// What each kind of words is asked to say, and the rule over all of
    /// them: no figure of the model's own.
    static func instructions(_ kind: WordsKind) -> String {
        let ask: String
        switch kind {
        case .weather:
            ask = "Say the weather for this flight as a pilot would brief it: the departure now, each leg at its time, the destination at arrival, then what could change it: the hazards, the pilot reports, the TFRs. Where the figures give a reason not to go VFR, say so plainly."
        case .risk:
            ask = "Say where the risk in this flight is, in the pilot's terms: the weather, the airplane, the pilot's own recency and minimums, the plan; and what would lower it, where the findings say. The most important first. Never say the flight is safe: the decision is the pilot in command's."
        case .notams:
            // Said plainly what each does -- a runway or taxiway closed, fuel
            // not to be had, parachute jumping, a TFR -- as AIEvaluations'
            // first run on the simulator (2026-11-09) found the model said
            // a NOTAM "matters" a third of the time without saying what it was.
            // And the NOTAM's contractions spelled out (RWY, TWY, CLSD): the
            // second run (2026-11-09) still named the matter in 4 of 6, the
            // misses keeping the NOTAM's own "RWY 18/36 CLSD".
            ask = "Say which NOTAMs and TFRs matter for this flight, the most important first. For each, say in plain words what it does (for example a runway or a taxiway closed, fuel not available, parachute jumping, a temporary flight restriction) and why it matters for this flight, from its reasons. Spell out the NOTAM's contractions in plain words: RWY is runway, TWY is taxiway, CLSD is closed, U/S is unserviceable, AVBL is available, PJE is parachute jumping."
        case .debrief:
            ask = "Say how the flight went against its plan, as an instructor would debrief it, the most important first."
        case .changes:
            ask = "Say what changed in this flight's weather since the last look, and what it means for the flight."
        case .remark:
            ask = "Write the remark for this flight's logbook entry, as a pilot writes the Remarks column: one or two short sentences saying where the flight went and what was flown or practised (the approaches, the holds, the landings and whether at night), from the figures. No greeting, no opinion of how it went."
        case .altitude:
            ask = "Say why the plan flies this altitude, as an instructor would explain it to a student: the direction of flight and the cruising-altitude rule, the terrain and obstacles under it, the airspace, the clouds, the winds and the fuel, and the cautions, the most important first, each from its figure."
        }
        return """
        You write a few plain sentences for a pilot from the figures given, which are a flight planner's own. \(ask)
        Rules: every figure, altitude, time, distance, wind, ceiling or visibility you mention must be quoted from the figures given, as given; never compute, round, convert or add one of your own. Every sentence must cite, by id, at least one of the figures it rests on, using the ids exactly as given and no other. Say nothing the figures do not say. Short sentences; no greeting, no advice beyond what a figure says.
        """
    }

    /// The figures as the model reads them: compact JSON, one object per
    /// figure, {id, label, text}.
    static func prompt(_ figures: [WordsSource]) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let json = (try? encoder.encode(figures)).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
        return "The figures, as JSON:\n\(json)\nWrite the sentences."
    }

    /// The words from this iPhone's model, else Apple's Private Cloud
    /// Compute where the phone's cannot run or none of its sentences
    /// passed (AppleModels); the model each came from named on them.
    func words(_ ask: WordsAsk) async throws -> Words {
        if let why = AppleModels.unavailableWhy { throw WordsUnavailable(why: why) }
        if ask.figures.isEmpty { return Words.checked([], sources: [], model: Self.model) }
        return try await AppleModels.attempt(usable: { !$0.sentences.isEmpty }) { place in
            let session = AppleModels.session(place, instructions: Self.instructions(ask.kind))
            let response = try await session.respond(to: Self.prompt(ask.figures), generating: WordsAnswer.self)
            let sentences = response.content.sentences.map { WordsSentence(sources: $0.sources, text: $0.text) }
            // A sentence quoting a number none of its figures holds is
            // dropped as well as one citing a figure not given (NumberGuard).
            return NumberGuard.kept(Words.checked(sentences, sources: ask.figures, model: place.model, most: 8))
        }.value
    }
}

// MARK: - The facade

/// The words from Apple's models, or no words with why in plain
/// language where they cannot be had (no Apple Intelligence, the model
/// not ready). Never a figure of its own: the figures are on the screen
/// already, and the words rest on them.
struct WordsFor: Sendable {
    var device: any WordsProvider = OnDeviceWords()

    func said(_ ask: WordsAsk) async -> SaidWords {
        do {
            let words = try await device.words(ask)
            return SaidWords(words: words, origin: .apple(words))
        } catch {
            Log.words.notice("the iPhone's \(ask.kind.rawValue, privacy: .public) words failed: \(error.localizedDescription, privacy: .public)")
            let why = (error as? WordsUnavailable)?.why ?? "Apple's on-device model could not write them."
            return SaidWords(words: .none("none", "No words: \(why)"), origin: .none)
        }
    }
}

extension Log {
    /// The words: a provider that failed, a sentence dropped.
    static let words = Logger(subsystem: subsystem, category: "words")
}
