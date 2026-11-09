import Foundation
import Testing
@testable import Wingtip

/// Ask with no signal (Wingtip/OnDevice): the figures the tools hand the
/// model are the engine's, through the phone's own bridge; a sentence
/// citing a figure not handed over, or a number not in what it cites, is
/// dropped; with no model the engine's own words answer; and the router
/// falls from the planner to the phone. The model is a fake here: the
/// simulator may have none.
struct OnDeviceAskTests {
    static let metarRaw = "KMSN 031853Z 27008G18KT 10SM FEW045 12/03 A3012"

    static func facts(metar: String = #"{"raw":"KMSN 031853Z 27008G18KT 10SM FEW045 12/03 A3012","flight_category":"VFR","wind_dir_true_deg":270,"wind_speed_kt":8,"wind_gust_kt":18,"temp_c":12,"altimeter_in_hg":30.12}"#) throws -> OnDeviceFacts {
        let runways = #"[{"closed":false,"lighted":true,"runway_ends":[{"ident":"18","heading_true_deg":180},{"ident":"36","heading_true_deg":360}],"wind":{"end":"36","headwind_kt":0,"crosswind_kt":-8,"gust_crosswind_kt":-18}}]"#
        var facts = OnDeviceFacts(dep: "KMSN", dest: "KDLH")
        facts.fields["KMSN"] = OnDeviceFacts.Field(ident: "KMSN", name: "Dane County Rgnl", elevationFt: 887,
                                                   runways: try Planner.snakeCase.decode([APIRunway].self, from: Data(runways.utf8)),
                                                   metar: try Planner.snakeCase.decode(Metar.self, from: Data(metar.utf8)),
                                                   taf: "TAF KMSN 031720Z 0318/0418 27010KT P6SM FEW050")
        facts.figures = Figures(cruiseTasKt: 110, fuelBurnGph: 8.4, usableFuelGal: 53)
        facts.own = OnDeviceFacts.Own(lat: 43.1, lon: -89.3, altitudeFt: 4500, groundspeedKt: 105, trackDeg: 90, groundFt: 900)
        return facts
    }

    // MARK: The figures, from the engine

    @Test func theWeatherIsTheReportAsSentWithItsSource() throws {
        let figures = try FieldFigures.weather("MSN", facts: try Self.facts())
        #expect(figures.map(\.id) == ["metar:KMSN", "taf:KMSN"])
        #expect(figures[0].said.contains(Self.metarRaw))
        #expect(figures[0].source.text.contains("Source: the METAR as sent"))
    }

    /// Runway 36 against a wind from 270 at 8 gusting 18: all of it
    /// across from the left, by the engine's wind_components.
    @Test func aNamedRunwaysCrosswindIsTheEnginesWithTheGusts() throws {
        let figures = try FieldFigures.crosswind("KMSN", runway: "36", facts: try Self.facts())
        #expect(figures.map(\.id) == ["wind:KMSN:36"])
        #expect(figures[0].said.contains("8 kt across from the left"))
        #expect(figures[0].said.contains("in the gusts, "))
        #expect(figures[0].said.contains("18 kt across from the left"))
        #expect(figures[0].source.text.contains("wind_components (FAA-H-8083-25C ch. 11)"))
    }

    @Test func aVariableWindIsRefusedNotGuessed() throws {
        let facts = try Self.facts(metar: #"{"raw":"KMSN 031853Z VRB04KT 10SM CLR 12/03 A3012","wind_speed_kt":4}"#)
        #expect(throws: AskRefused.self) { try FieldFigures.crosswind("KMSN", runway: "36", facts: facts) }
    }

    @Test func theDensityAltitudeIsTheEnginesFromTheReport() throws {
        let figure = try #require(try FieldFigures.densityAltitude("KMSN", facts: try Self.facts()).first)
        let pressure = try Engine.pressureAltitudeFt(elevationFt: 887, altimeterInhg: 30.12)
        let density = try Engine.gonogoDensityAltitude(pressureAltFt: pressure, tempC: 12)
        #expect(figure.said.contains(Format.altitude(density.rounded())))
        #expect(figure.source.text.contains("PHAK ch. 4"))
    }

    @Test func theNearestFieldsAreRankedByTheEngineFromThePacks() throws {
        let pins: FlightFigures.Pins = { _, _, _, _ in
            [AirportPin(ident: "KFAR", kind: "airport", lat: 43.6, lon: -89.3, name: "Far Away"),
             AirportPin(ident: "KNEAR", kind: "airport", lat: 43.12, lon: -89.3, name: "Near By")]
        }
        let figures = try FlightFigures.nearest(facts: try Self.facts(), pins: pins)
        #expect(figures.map(\.id) == ["nearest:KNEAR", "nearest:KFAR"])
        #expect(figures[0].source.text.contains("best_fields"))
    }

    @Test func theGlideAndEnduranceAreTheEngines() throws {
        let facts = try Self.facts()
        let range = try #require(try Engine.glideRange(altitudeFt: 4500, speedKt: 105, groundFt: 900))
        #expect(try FlightFigures.glide(facts: facts)[0].said.contains(Format.distance(range)))
        let minutes = try #require(try Engine.filedEndurance(fuelGal: 20, burnGph: 8.4))
        let fuel = try FlightFigures.fuel(onBoardGal: 20, facts: facts)
        #expect(fuel.map(\.id) == ["fuel:endurance"])
        #expect(fuel[0].said.contains(Format.duration(Double(minutes))))
    }

    // MARK: The guard

    @Test func aNumberNotInTheFiguresIsCaught() {
        #expect(NumberGuard.numbers(in: "5,500 ft, runway 09, 1.5 nm.") == [5500, 9, 1.5])
        #expect(NumberGuard.invented("9 kt across", given: ["8 kt across from the left"]) == [9])
        #expect(NumberGuard.invented("Runway 36: 8 kt across.", given: ["Runway 36 at KMSN: 8 kt across"]).isEmpty)
    }

    // MARK: The answer

    /// A model that calls the tools' work itself and answers as told.
    struct FakeModel: AskModel {
        var unavailableWhy: String?
        var sentences: [WordsSentence] = []
        var fails = false
        func sentences(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts, log: FigureLog) async throws -> [WordsSentence] {
            if fails { throw AskRefused(why: "boom") }
            log.add(try FieldFigures.crosswind("KMSN", runway: "36", facts: facts), by: "runwayWind")
            return sentences
        }
    }

    @Test func onlySentencesCitingAToolsFigureWithItsNumbersAreKept() async throws {
        let model = FakeModel(sentences: [
            WordsSentence(sources: ["wind:KMSN:36"], text: "Runway 36 has 8 kt across from the left."),
            WordsSentence(sources: ["wind:KMSN:36"], text: "That is 9 kt across."),
            WordsSentence(sources: ["metar:KDLH"], text: "Duluth is clear."),
        ])
        let answer = await OnDeviceAsk(model: model).answer("Crosswind on 36?", facts: try Self.facts())
        #expect(answer.origin == .device)
        #expect(answer.words.sentences.map(\.text) == ["Runway 36 has 8 kt across from the left."])
        #expect(answer.words.sources.map(\.id) == ["wind:KMSN:36"])
        #expect(answer.lines.first == .origin("On this iPhone"))
    }

    @Test func withNoModelTheEnginesWordsAnswerAndSayWhy() async throws {
        let model = FakeModel(unavailableWhy: "Apple Intelligence is off in Settings.")
        let answer = await OnDeviceAsk(model: model).answer("What's the crosswind at MSN runway 36?", facts: try Self.facts())
        #expect(answer.origin == .engine)
        #expect(answer.caption == "The engine on this iPhone · Apple Intelligence is off in Settings.")
        #expect(answer.words.sentences.first?.sources == ["wind:KMSN:36"])
    }

    @Test func aModelThatFailsOrCitesNothingFallsToTheEngine() async throws {
        let failing = await OnDeviceAsk(model: FakeModel(fails: true)).answer("fuel endurance", facts: try Self.facts())
        #expect(failing.origin == .engine)
        #expect(failing.words.sentences.map(\.sources) == [["fuel:endurance"]])
        let empty = await OnDeviceAsk(model: FakeModel()).answer("glide", facts: try Self.facts())
        #expect(empty.origin == .engine)
        #expect(empty.words.sentences.map(\.sources) == [["glide"]])
    }

    @Test func theEnginesWordsReadTheQuestion() throws {
        let facts = try Self.facts()
        #expect(EngineWords.topics("What's the crosswind at MSN runway 36?") == [.wind])
        #expect(EngineWords.topics("Is the airplane OK?") == [.route])
        #expect(EngineWords.topics("How many gallons for the reserve?") == [.fuel])
        #expect(EngineWords.ident("winds at msn", facts: facts) == "MSN")
        #expect(EngineWords.runway("rwy 18 please") == "18")
    }

    /// The runtime check: on this simulator or phone the model is there or
    /// is not; without it the answer is the engine's, never a failure.
    @Test func theRealModelsAbsenceDegradesToTheEngine() async throws {
        guard let why = OnDeviceWords.unavailableWhy else { return }
        let answer = await OnDeviceAsk(model: AppleAskModel()).answer("crosswind runway 36", facts: try Self.facts())
        #expect(answer.origin == .engine)
        #expect(answer.why == why)
        #expect(!answer.words.sentences.isEmpty)
    }
}
