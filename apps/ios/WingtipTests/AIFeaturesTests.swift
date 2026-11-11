import Foundation
import Testing
@testable import Wingtip

/// The on-device AI added beside the clearance, the logbook and the
/// altitude wheel, with a fake model where the simulator has none: what
/// each keeps of a model's words, and the engine's answer where it keeps
/// none (ClearanceInFull, RemarkDraft, AltitudeWhy).
struct AIFeaturesTests {
    // MARK: On the phone, then Apple's Private Cloud Compute

    @Test func theCloudIsAskedOnlyWhereThePhoneFailsOrIsDropped() async throws {
        var asked: [ModelPlace] = []
        let first = try await AppleModels.attempt([.device, .cloud]) { place in asked.append(place); return "words" }
        #expect(first.place == .device)
        #expect(asked == [.device])
        asked = []
        let failed = try await AppleModels.attempt([.device, .cloud]) { place -> String in
            asked.append(place)
            if place == .device { throw WordsUnavailable(why: "no") }
            return "cloud words"
        }
        #expect(failed.value == "cloud words" && failed.place == .cloud)
        let dropped = try await AppleModels.attempt([.device, .cloud], usable: { !$0.isEmpty }) { place in place == .device ? "" : "kept" }
        #expect(dropped.place == .cloud)
        let neither = try await AppleModels.attempt([.device, .cloud], usable: { !$0.isEmpty }) { _ in "" }
        #expect(neither.value.isEmpty)
        #expect(ModelPlace.of(model: ModelPlace.cloud.model) == .cloud)
        #expect(WordsOrigin.apple(Words(model: "apple-pcc", sentences: [], sources: [], unavailable: nil)) == .cloud)
    }

    @Test func theCloudIsOffUntilTheOwnerHasTheEntitlement() {
        // Info.plist's WingtipPrivateCloudCompute is NO until Apple assigns it.
        #expect(!AppleModels.cloudEnabled)
        #expect(AppleModels.cloudUnavailableWhy != nil)
        #expect(!AppleModels.places.contains(.cloud))
    }

    // MARK: The clearance said in full

    @Test func aClearanceInShorthandSaidInFullIsOfferedWithWhatItAdds() throws {
        let heard = "C KDLH RV M 3000 E 7000 10 DP 125.35 SQ 4521"
        let said = "Cleared to KDLH airport via radar vectors, maintain 3,000, expect 7,000 10 minutes after departure, departure frequency 125.35, squawk 4521."
        let offer = try #require(ClearanceInFull.offer(heard: heard, said: said))
        #expect(offer.said == said)
        #expect(!offer.adds.isEmpty)
        #expect(offer.adds.allSatisfy(ClearanceInFull.order.contains))
    }

    @Test func wordsWithAFigureOfTheModelsOwnAreNotOffered() {
        let heard = "C KDLH RV M 3000 E 7000 10 DP 125.35 SQ 4521"
        #expect(ClearanceInFull.offer(heard: heard, said: "Cleared to KDLH airport, maintain 3,000, squawk 4522.") == nil)
    }

    @Test func spokenFiguresSaidAsDigitsAreTheEnginesOwn() {
        // The engine reads "one two five point three five" as 125.35
        // (tokens), so the digits are no figure of the model's; the
        // words add nothing the engine did not read, so none is offered.
        let heard = "departure frequency one two five point three five squawk four five two one"
        #expect(ClearanceInFull.offer(heard: heard, said: "Departure frequency 125.35, squawk 4521.") == nil)
        #expect(NumberGuard.invented("Departure frequency 125.35, squawk 4521.",
                                     given: [heard] + ((try? Engine.tokens(text: heard)) ?? []).compactMap(\.num)).isEmpty)
    }

    @Test func wordsTheEngineReadsDifferentlyAreNotOffered() {
        // The same figures, swapped: the engine's reading changes.
        let heard = "maintain 3000 expect 5000"
        #expect(ClearanceInFull.offer(heard: heard, said: "Maintain 5000, expect 3000, squawk.") == nil)
        #expect(ClearanceInFull.offer(heard: heard, said: heard) == nil)
    }

    @Test func noModelNoOffer() async {
        #expect(await ClearanceInFull.ask("C KDLH SQ 4521", model: { _ in nil }) == nil)
        #expect(await ClearanceInFull.ask("C KDLH SQ 4521", model: { _ in throw WordsUnavailable(why: "no") }) == nil)
    }

    // MARK: The logbook's remark

    static let entry = LogbookEntryRequest(flownOn: "2026-10-28", aircraft: "N3429J", aircraftType: "P28A", route: "KDLH KHIB", totalHours: 1.2,
                                           crossCountryHours: 1.2, dayLandings: 2, distanceNm: 62.4, longestLegNm: 62.4)

    @Test func theRemarksFactsAreTheEntrysColumnsAsTyped() {
        let figures = RemarkDraft.figures(Self.entry)
        #expect(figures.map(\.id) == ["entry", "times", "landings", "distance"])
        #expect(figures[0].text.contains("KDLH KHIB"))
        #expect(figures[1].text == "total 1.2 h, cross-country 1.2 h")
        // A column left at nought is not a fact to word.
        #expect(!figures[1].text.contains("night"))
    }

    @Test func aRemarkKeepsOnlySentencesWithTheEntrysOwnFigures() async {
        let fake = WordsTests.Fake(words: Words(model: "apple-on-device", sentences: [
            WordsSentence(sources: ["entry", "landings"], text: "Cross-country from KDLH to KHIB in N3429J with 2 landings."),
            WordsSentence(sources: ["times"], text: "Flew 1.5 h."),
            WordsSentence(sources: ["nothing"], text: "Smooth air."),
        ], sources: [], unavailable: nil))
        let remark = await RemarkDraft.draft(RemarkDraft.figures(Self.entry), device: fake)
        #expect(remark == .success("Cross-country from KDLH to KHIB in N3429J with 2 landings."))
    }

    @Test func noRemarkWhereNothingPassesSaysWhy() async {
        let fake = WordsTests.Fake(words: Words(model: "apple-on-device", sentences: [
            WordsSentence(sources: ["times"], text: "Flew 3 h."),
        ], sources: [], unavailable: nil))
        guard case .failure(let why) = await RemarkDraft.draft(RemarkDraft.figures(Self.entry), device: fake) else {
            Issue.record("a remark with a figure of its own was kept")
            return
        }
        #expect(why.why.contains("figures"))
        guard case .failure = await RemarkDraft.draft(RemarkDraft.figures(Self.entry), device: WordsTests.Fake()) else {
            Issue.record("no model gave a remark")
            return
        }
    }

    // MARK: Why this altitude

    static func altitudeLine() -> NavLogAltitude {
        let selection = AltitudeSelection(airspaceCeilingFt: 8000, airspaceTransits: [], candidatesFt: [3500, 5500, 7500], courseMagneticDeg: 62,
                                          eastbound: true, floorFt: 2600, hazards: [], recommendedFt: 5500, rules: "vfr", serviceCeilingFt: 13000)
        let fastest = AltitudeOption(eteMin: 52, fuelGal: 8.4, kind: "fastest", legsWithoutWind: 0, needsOxygen: false,
                                     steps: [AltitudeStep(altitudeFt: 5500, distanceNm: 84, from: "KMSN", to: "KDLH")], tailwindKt: 12, unflyableLegs: 0)
        return NavLogAltitude(altitudeFt: 5500, altitudeSelection: selection, flown: "fastest", options: [fastest])
    }

    struct FakeAltitudeModel: AltitudeWhyModel {
        var sentences: [WordsSentence]
        var fails = false
        func sentences(_ reasons: AltitudeWhy.Reasons, log: FigureLog) async throws -> [WordsSentence] {
            if fails { throw AskRefused(why: "boom") }
            log.add(reasons.rule + reasons.winds, by: "tools")
            return sentences
        }
    }

    @Test func theReasonsAreTheEnginesAndThePlannersFigures() throws {
        let reasons = try #require(AltitudeWhy.reasons(Self.altitudeLine(), flownFt: nil, choice: nil))
        #expect(reasons.flown.said == "The plan flies 5,500 ft, the fastest plan.")
        let rule = try #require(reasons.rule.first)
        // The engine on the phone: 062° is eastbound (14 CFR 91.159(a)).
        #expect(rule.said.contains("eastbound"))
        #expect(rule.source.text.contains("91.159(a)"))
        #expect(reasons.limits.map(\.id) == ["limit:floor", "limit:ceiling", "limit:classB"])
        #expect(reasons.winds.first?.said == "The fastest plan flies 5,500 ft in 52m on 8.4 gal with 12 kt of tailwind.")
    }

    @Test func whyThisAltitudeKeepsOnlyCitedSentencesWithTheirFigures() async throws {
        let reasons = try #require(AltitudeWhy.reasons(Self.altitudeLine(), flownFt: nil, choice: nil))
        let model = FakeAltitudeModel(sentences: [
            WordsSentence(sources: ["altitude:flown", "plan:fastest"], text: "5,500 ft is the fastest, with 12 kt of tailwind."),
            WordsSentence(sources: ["plan:fastest"], text: "It saves 9 minutes."),
            WordsSentence(sources: ["limit:floor"], text: "The floor is 2,600 ft."),
        ])
        let answer = await AltitudeWhy.said(reasons, model: model)
        #expect(answer.origin == .device)
        #expect(answer.words.sentences.map(\.text) == ["5,500 ft is the fastest, with 12 kt of tailwind."])
    }

    @Test func whereNoSentencePassesTheEnginesOwnWordsAreGiven() async throws {
        let reasons = try #require(AltitudeWhy.reasons(Self.altitudeLine(), flownFt: nil, choice: nil))
        let none = await AltitudeWhy.said(reasons, model: FakeAltitudeModel(sentences: [WordsSentence(sources: ["plan:fastest"], text: "Fly 9,500.")]))
        #expect(none.origin == .engine)
        #expect(none.words.sentences.first?.text == reasons.flown.said)
        let failed = await AltitudeWhy.said(reasons, model: FakeAltitudeModel(sentences: [], fails: true))
        #expect(failed.origin == .engine)
    }
}
