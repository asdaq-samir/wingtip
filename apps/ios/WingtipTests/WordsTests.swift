import Foundation
import Testing
@testable import Wingtip

/// The words over the briefing and the Go / No-Go (Words.swift): where
/// they come from, and the guard every sentence passes.
struct WordsTests {
    /// A provider that answers with given words, or throws.
    struct Fake: WordsProvider {
        var words: Words?
        var error: any Error = WordsUnavailable(why: "Not here.")
        func words(_ ask: WordsAsk) async throws -> Words {
            if let words { return words }
            throw error
        }
    }

    static let figures = [
        WordsSource(id: "metar:KMSN", label: "KMSN METAR, VFR", text: "KMSN 031853Z 27008KT 10SM FEW045 12/03 A3012"),
        WordsSource(id: "finding:fuel", label: "Fuel: ok", text: "Needs 30.2 gal with taxi and a 30 min reserve; 22.8 gal spare"),
    ]

    static let ask = WordsAsk(kind: .weather, figures: figures)

    static let devices = Words(model: "apple-on-device", sentences: [WordsSentence(sources: ["finding:fuel"], text: "Fuel is enough.")], sources: [figures[1]], unavailable: nil)

    @Test func theFacadeGivesThisIphonesWords() async {
        let said = await WordsFor(device: Fake(words: Self.devices)).said(Self.ask)
        #expect(said.origin == .device)
        #expect(said.words.sentences.map(\.text) == ["Fuel is enough."])
        #expect(said.origin.caption == "On this iPhone")
    }

    @Test func noWordsSayWhyInPlainLanguage() async {
        let said = await WordsFor(device: Fake(words: nil, error: WordsUnavailable(why: "Apple Intelligence is off in Settings."))).said(Self.ask)
        #expect(said.origin == .none)
        #expect(said.words.sentences.isEmpty)
        #expect(said.words.unavailable == "No words: Apple Intelligence is off in Settings.")
    }

    /// The guard: a sentence citing an id it was not given is dropped,
    /// as is one citing nothing; the rest keep their order, and only the
    /// figures cited come back.
    @Test func aSentenceCitingAnUnknownIdIsDropped() throws {
        let said = [
            WordsSentence(sources: ["metar:KMSN"], text: "KMSN is VFR."),
            WordsSentence(sources: ["metar:KDLH"], text: "KDLH is IFR."),
            WordsSentence(sources: ["finding:fuel", "metar:KMSN", "metar:KDLH"], text: "Fuel is enough, and KMSN is VFR."),
            WordsSentence(sources: [], text: "Something with no figure."),
            WordsSentence(sources: [" finding:fuel ", "finding:fuel"], text: "  Fuel is enough.  "),
        ]
        let words = Words.checked(said, sources: Self.figures, model: "test")
        #expect(words.sentences.map(\.text) == ["KMSN is VFR.", "Fuel is enough."])
        #expect(words.sentences[1].sources == ["finding:fuel"])
        #expect(words.sources.map(\.id) == ["metar:KMSN", "finding:fuel"])
        #expect(words.unavailable == nil)
    }

    @Test func atMostSoManySentencesAreKept() throws {
        let said = (0..<12).map { _ in WordsSentence(sources: ["metar:KMSN"], text: "KMSN is VFR.") }
        #expect(Words.checked(said, sources: Self.figures, model: "test", most: 8).sentences.count == 8)
    }

    /// The figures the phone assembles carry the planner's ids, so a chip
    /// means the same whichever model wrote the sentence.
    @Test func theBriefingsFiguresCarryThePlannersIds() throws {
        var briefing = Briefing(airports: .init(), forecast: Forecast(minCeilingFt: nil, minVisibilitySm: nil, stations: []), hazards: [], metars: .init(), weatherUnavailable: [])
        briefing.metars.additionalProperties = ["KMSN": Metar(flightCategory: "VFR", raw: "KMSN 031853Z 27008KT 10SM FEW045 12/03 A3012"), "KDLH": nil]
        briefing.hazards = [Hazard(hazard: "CONVECTIVE", raw: "WSUS31 ...", type: "SIGMET")]
        briefing.gairmets = [GAirmet(altitudeHighFt: -1, dueTo: "clouds", hazard: "IFR", severity: nil)]
        briefing.tfrs = [RouteTfr(activeNow: false, alongTrackNm: 12, crosses: true, notamId: "6/1234", title: "Stadium")]
        briefing.forecast = Forecast(minCeilingFt: 3000, minVisibilitySm: 6, stations: [ForecastStation(icaoId: "KMSN", raw: "TAF KMSN ...")])
        briefing.vfrNotRecommended = ["IFR along the route"]
        briefing.weatherUnavailable = ["pireps"]
        let ids = WordsFigures.weather(briefing, dep: "KMSN", dest: "KDLH", stops: [], eteMin: 95).map(\.id)
        #expect(ids == ["flight:route", "unchecked", "vfr-not-recommended", "metar:KDLH", "metar:KMSN", "taf:KMSN", "hazard:0", "gairmet:0", "tfr:6/1234"])
        let gairmet = try #require(WordsFigures.weather(briefing, dep: "KMSN", dest: "KDLH", stops: [], eteMin: nil).first { $0.id == "gairmet:0" })
        // No top for an IFR G-AIRMET given -1, as the web writes it.
        #expect(!gairmet.text.contains("From "))
    }

    @Test func theGoNoGosFiguresCarryThePlannersIds() throws {
        let answer = try Planner.json.decode(GoNoGoAnswer.self, from: Data(GoNoGoTests.answer.utf8))
        let ids = WordsFigures.risk(answer).map(\.id)
        #expect(ids.first == "verdict:line")
        #expect(ids.contains("finding:fuel") && ids.contains("risk:line") && ids.contains("risk:stress"))
        let unlawful = try #require(WordsFigures.risk(answer).first { $0.id == "risk:line" })
        #expect(unlawful.text.contains("8 points, level caution"))
    }

    /// The on-device model's prompt is the figures as compact JSON and
    /// nothing else; its instructions forbid a figure of the model's own.
    @Test func theDevicePromptIsTheFiguresAsJson() throws {
        let prompt = OnDeviceWords.prompt(Self.figures)
        #expect(prompt.contains(#""id":"metar:KMSN""#) && prompt.contains(#""id":"finding:fuel""#))
        #expect(OnDeviceWords.instructions(.weather).contains("never compute"))
        #expect(OnDeviceWords.instructions(.risk).contains("Never say the flight is safe"))
    }
}
