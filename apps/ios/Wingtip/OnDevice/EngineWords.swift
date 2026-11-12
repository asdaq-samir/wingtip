import Foundation

/// The answer with no model at all -- a phone without Apple Intelligence,
/// or off, the model still downloading, and no signal to the planner: the
/// question is matched to the figures it asks for by its words, and each
/// figure is said as the engine's own sentence, citing itself. Plain, but
/// every word of it is a figure the engine or a report gave.
enum EngineWords {
    /// What a question asks for, by the words a pilot uses.
    enum Topic: String, CaseIterable, Sendable {
        case wind, density, weather, fuel, glide, nearest, route
    }

    /// The topics a question names, in the order above; the route where
    /// it names none.
    static func topics(_ question: String) -> [Topic] {
        let words = question.lowercased()
        let named: [(Topic, [String])] = [
            (.wind, ["crosswind", "headwind", "tailwind", "runway", "wind"]),
            (.density, ["density"]),
            (.weather, ["weather", "metar", "taf", "ceiling", "visibility", "vfr", "ifr", "forecast"]),
            (.fuel, ["fuel", "endurance", "gallon", "reserve"]),
            (.glide, ["glide", "engine out", "engine failure"]),
            (.nearest, ["nearest", "closest", "divert", "land now", "airport near"]),
            (.route, ["route", "plan", "how long", "distance", "ete", "altitude"]),
        ]
        // A word by its start ("gallons", "planned"), a phrase anywhere:
        // "airplane" is not "plan", nor "complete" "ete".
        let tokens = words.split { !$0.isLetter }.map(String.init)
        func says(_ key: String) -> Bool { key.contains(" ") ? words.contains(key) : tokens.contains { $0.hasPrefix(key) } }
        let found = named.filter { _, keys in keys.contains(where: says) }.map(\.0)
        return found.isEmpty ? [.route] : found
    }

    /// The field a question names: a held field's ident, with or without
    /// its K ("MSN", "KMSN"); nil for the destination.
    static func ident(_ question: String, facts: OnDeviceFacts) -> String? {
        let tokens = question.uppercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
        return tokens.first { facts.fields[$0] != nil || (($0.count == 3) && facts.fields["K" + $0] != nil) }
    }

    /// The runway a question names: "runway 36", "rwy 18L".
    static func runway(_ question: String) -> String? {
        let tokens = question.uppercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
        guard let at = tokens.firstIndex(where: { $0 == "RUNWAY" || $0 == "RWY" }), at + 1 < tokens.count else { return nil }
        let end = tokens[at + 1]
        return end.first?.isNumber == true && end.count <= 3 ? end : nil
    }

    /// The figures for a topic, or why there are none.
    static func figures(_ topic: Topic, question: String, facts: OnDeviceFacts, pins: FlightFigures.Pins) throws -> [AskFigure] {
        let ident = ident(question, facts: facts)
        switch topic {
        case .wind: return try FieldFigures.crosswind(ident, runway: runway(question), facts: facts)
        case .density: return try FieldFigures.densityAltitude(ident, facts: facts)
        case .weather: return try FieldFigures.weather(ident, facts: facts)
        case .fuel: return try FlightFigures.fuel(onBoardGal: nil, facts: facts)
        case .glide: return try FlightFigures.glide(facts: facts)
        case .nearest: return try FlightFigures.nearest(facts: facts, pins: pins)
        case .route: return try FlightFigures.route(facts: facts)
        }
    }

    /// Whether the phone holds any figure a tool could hand a model for
    /// this question, by every topic, not only the ones it names: the
    /// model picks its tools, and none answering means no model is asked
    /// (OnDeviceAsk). The cheap figures first; the nearest fields read
    /// the packs.
    static func holdsAny(_ question: String, facts: OnDeviceFacts, pins: FlightFigures.Pins = FlightFigures.packPins) -> Bool {
        Topic.allCases.contains { topic in (try? figures(topic, question: question, facts: facts, pins: pins))?.isEmpty == false }
    }

    /// The answer: each figure's sentence citing itself; with none, why
    /// not, from the first topic asked.
    static func answer(_ question: String, facts: OnDeviceFacts, pins: FlightFigures.Pins = FlightFigures.packPins) -> Words {
        var figures: [AskFigure] = []
        var why: String?
        for topic in topics(question) {
            do {
                figures += try Self.figures(topic, question: question, facts: facts, pins: pins).filter { f in !figures.contains { $0.id == f.id } }
            } catch {
                why = why ?? ((error as? AskRefused)?.why ?? error.localizedDescription)
            }
        }
        guard !figures.isEmpty else { return .none("engine", why ?? "This iPhone holds nothing to answer that with.") }
        let sentences = figures.map { WordsSentence(sources: [$0.id], text: $0.said) }
        return Words(model: "engine", sentences: sentences, sources: figures.map(\.source), unavailable: nil)
    }
}
