import Foundation
import FoundationModels
import OpenAPIRuntime
import os

/// The briefing and the Go / No-Go in a few plain sentences, each
/// resting on figures the pilot can read raw. The figures are always the
/// engine's or the planner's; the words are a model's: the planner's
/// (POST /api/words/{kind}, app.ai_words, Claude) while the planner can be
/// reached, else Apple's on-device model (FoundationModels), with
/// no signal in the air. A sentence cites the figures it rests on by
/// their ids, and a sentence citing an id it was not given is dropped,
/// here as on the planner (app.ai_words.checked): the model can cite
/// wrongly, and a sentence resting on nothing is not shown. Neither
/// model is asked for a figure, and the screen's own figures are never
/// touched: the words are an addition above them.

/// One figure a sentence can rest on (app.ai_words.Source): its id, as the
/// planner names them ("metar:KMSN", "taf:KMSN", "hazard:0",
/// "finding:fuel"), the chip's label and the raw text the chip opens.
/// Generated from the assistant's OpenAPI document, as the next two are.
typealias WordsSource = ASSource

extension WordsSource: @retroactive Identifiable {}

/// One sentence and the ids of the figures it rests on (app.ai_words.Sentence).
typealias WordsSentence = ASSentence

/// The words endpoints' answer (app.ai_words.WordsAnswer), and the shape the
/// on-device words take too: the sentences, the most important first;
/// the sources they cite, in the order given; which model wrote them;
/// and, with no sentences, why not, in words.
typealias Words = ASWordsAnswer

extension Words {
    /// No words, and why.
    static func none(_ model: String, _ why: String) -> Words {
        Words(model: model, sentences: [], sources: [], unavailable: why)
    }

    /// The sentences every one of whose cited ids is a figure given, the
    /// first `most` of them, and the figures they cite in the order
    /// given; the rest dropped (app.ai_words.checked). A sentence citing
    /// nothing rests on nothing and goes too, as does one citing an id
    /// not given, however plausible it reads: the model can cite wrongly,
    /// and a sentence whose chip would open nothing is not shown.
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

/// Which words endpoint, and which instructions on the device.
enum WordsKind: String, Sendable {
    case notams, weather, risk, debrief, changes
    /// On this iPhone only, the planner having no endpoint for them: a
    /// logbook entry's remark (RemarkDraft) and why the plan flies its
    /// altitude (AltitudeWhy).
    case remark, altitude
}

/// What the words are asked for: the planner's body for its endpoint,
/// encoded already (Planner.snakeEncoder), and the same figures as the
/// phone assembles them (WordsFigures) for the on-device model, which
/// can reach no planner.
struct WordsAsk: Sendable {
    let kind: WordsKind
    let body: Data
    let figures: [WordsSource]

    init(kind: WordsKind, body: some Encodable, figures: [WordsSource]) throws {
        self.kind = kind
        self.body = try Planner.snakeEncoder.encode(body)
        self.figures = figures
    }
}

/// Where the words came from, for the caption over them: the pilot
/// should know which model wrote what they read.
enum WordsOrigin: Equatable, Sendable {
    case planner, device, cloud, none

    var caption: String {
        switch self {
        case .planner: "From the planner"
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

/// A source of words: the planner, the device, or a fake in a test.
protocol WordsProvider: Sendable {
    func words(_ ask: WordsAsk) async throws -> Words
}

/// Why a provider gave no words, in words a pilot reads.
struct WordsUnavailable: Error, LocalizedError, Equatable {
    let why: String
    var errorDescription: String? { why }
}

// MARK: - The planner's words

/// The planner's words (POST /api/words/{kind}, through the gateway's
/// /api/planner proxy): the planner assembles the figures itself from
/// the same ask the briefing and the Go / No-Go took, and answers with
/// Claude's sentences checked against them. Its "unavailable" (the
/// planner reached, its model not) is passed on as it came, and the
/// facade asks the device instead (WordsFor.said).
struct PlannerWords: WordsProvider {
    func words(_ ask: WordsAsk) async throws -> Words {
        let words = try await Self.asked(ask)
        if words.sentences.isEmpty, words.unavailable != nil { return words }
        // Checked again on the phone: the planner checks its own, but the
        // chips open only what the answer carries.
        return Words.checked(words.sentences, sources: words.sources, model: words.model)
    }
}

extension PlannerWords {
    /// The assistant's answer for the ask's kind, through its generated
    /// client: the body, encoded already, is the open object each words
    /// endpoint takes, and each answer is read as the Words they share.
    static func asked(_ ask: WordsAsk) async throws -> Words {
        let body = try JSONDecoder().decode(OpenAPIObjectContainer.self, from: ask.body)
        let answer: any Encodable = switch ask.kind {
        case .weather: try await Planner.ask { try await $0.weatherWords(body: .json(.init(additionalProperties: body))).ok.body.json }
        case .risk: try await Planner.ask { try await $0.riskWords(body: .json(.init(additionalProperties: body))).ok.body.json }
        case .notams: try await Planner.ask { try await $0.notamWords(body: .json(.init(additionalProperties: body))).ok.body.json }
        case .changes: try await Planner.ask { try await $0.changesWords(body: .json(.init(additionalProperties: body))).ok.body.json }
        case .debrief: try await Planner.ask { try await $0.debriefWords(body: .json(.init(additionalProperties: body))).ok.body.json }
        case .remark, .altitude: throw WordsUnavailable(why: "The planner has no words of this kind.")
        }
        return try Engine.recoded(answer, encoder: JSONEncoder(), decoder: Planner.json)
    }
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

    /// What each kind of words is asked to say, as the planner asks its
    /// model (app.routers.words WEATHER_ASK, RISK_ASK), and the rule over
    /// all of them: no figure of the model's own.
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

/// Where the words come from, in order: the planner first; this iPhone
/// when the planner fails or cannot be reached; and no words, with why
/// in plain language, when neither can (no Apple Intelligence, the model not
/// ready, no signal and no planner). Never a figure of its own: the
/// figures are on the screen already, and the words rest on them.
/// While the server's Claude features are off (ServerFeatures, the
/// owner's decision of 2026-11-10 in docs/decisions) the planner is not
/// asked: its words are Claude's, and Apple's models answer alone.
struct WordsFor: Sendable {
    var planner: any WordsProvider = PlannerWords()
    var device: any WordsProvider = OnDeviceWords()
    var claudeOn: @Sendable () -> Bool = { ServerFeatures.claudeOnNow }

    init(planner: any WordsProvider = PlannerWords(), device: any WordsProvider = OnDeviceWords(),
         claudeOn: @escaping @Sendable () -> Bool = { ServerFeatures.claudeOnNow }) {
        self.planner = planner
        self.device = device
        self.claudeOn = claudeOn
    }

    func said(_ ask: WordsAsk) async -> SaidWords {
        let server = claudeOn()
        if server { if let words = await fromPlanner(ask) { return SaidWords(words: words, origin: .planner) } }
        do {
            let words = try await device.words(ask)
            return SaidWords(words: words, origin: .apple(words))
        } catch {
            Log.words.notice("the iPhone's \(ask.kind.rawValue, privacy: .public) words failed: \(error.localizedDescription, privacy: .public)")
            let why = (error as? WordsUnavailable)?.why ?? "Apple's on-device model could not write them."
            let said = server ? "No words: the planner cannot be reached, and \(why.prefix(1).lowercased() + why.dropFirst())" : "No words: \(why)"
            return SaidWords(words: .none("none", said), origin: .none)
        }
    }

    /// The planner's words, or nil where it failed or its model was not
    /// reached, which is a reason to ask this iPhone.
    private func fromPlanner(_ ask: WordsAsk) async -> Words? {
        do {
            let words = try await planner.words(ask)
            // The planner reached but its model not ("The briefer could not
            // be reached."): no sentences, and a reason to ask this iPhone,
            // not an answer of no words. Here, not in PlannerWords, so a
            // provider's own "unavailable" is read in one place.
            if !(words.sentences.isEmpty && words.unavailable != nil) { return words }
            Log.words.notice("the planner's \(ask.kind.rawValue, privacy: .public) words were unavailable")
        } catch {
            Log.words.notice("the planner's \(ask.kind.rawValue, privacy: .public) words failed: \(error.localizedDescription, privacy: .public)")
        }
        return nil
    }
}

extension Log {
    /// The words: a provider that failed, a sentence dropped.
    static let words = Logger(subsystem: subsystem, category: "words")
}
