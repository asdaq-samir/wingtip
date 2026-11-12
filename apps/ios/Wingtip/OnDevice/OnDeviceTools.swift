import Foundation
import FoundationModels

/// The tools Apple's on-device model calls to answer a question in the
/// air (Foundation Models' Tool protocol): each asks the engine on the
/// phone (FieldFigures, FlightFigures) and hands the model the figures
/// with the ids it must cite, so an answer is worked out, not guessed.
/// What the model is handed is logged (FigureLog), and the answer's
/// sentences may cite only those (OnDeviceAsk). Five, not more: the
/// on-device model's context is small, and each tool's schema is in it.
enum OnDeviceTools {
    static func all(_ facts: OnDeviceFacts, log: FigureLog) -> [any Tool] {
        [
            FieldWeatherTool(facts: facts, log: log), RunwayWindTool(facts: facts, log: log), FuelTool(facts: facts, log: log),
            GlideTool(facts: facts, log: log), NearestFieldsTool(facts: facts, log: log),
        ]
    }

    /// What a tool hands the model: one line a figure, "[id] label: words",
    /// or why there is none, in words the model can pass on.
    static func run(_ name: String, log: FigureLog, _ work: () throws -> [AskFigure]) -> String {
        do {
            let figures = try work()
            log.add(figures, by: name)
            return figures.map(\.forModel).joined(separator: "\n")
        } catch {
            log.add([], by: name)
            return "Not available: \((error as? AskRefused)?.why ?? error.localizedDescription)"
        }
    }
}

struct FieldWeatherTool: Tool {
    let name = "fieldWeather"
    let description = "The METAR and TAF this iPhone holds for an airport on the route, as sent, and its density altitude."
    let facts: OnDeviceFacts
    let log: FigureLog

    @Generable
    struct Arguments {
        @Guide(description: "The airport's ICAO ident, such as KMSN; empty for the destination.")
        var ident: String
    }

    func call(arguments: Arguments) async throws -> String {
        OnDeviceTools.run(name, log: log) {
            var figures = try FieldFigures.weather(arguments.ident, facts: facts)
            // The density altitude where the report gives what it needs.
            figures += (try? FieldFigures.densityAltitude(arguments.ident, facts: facts)) ?? []
            return figures
        }
    }
}

struct RunwayWindTool: Tool {
    let name = "runwayWind"
    let description = "The reported wind's headwind and crosswind on an airport's runways, from the METAR this iPhone holds."
    let facts: OnDeviceFacts
    let log: FigureLog

    @Generable
    struct Arguments {
        @Guide(description: "The airport's ICAO ident, such as KMSN; empty for the destination.")
        var ident: String
        @Guide(description: "The runway the pilot names, such as 36 or 18L; empty for every runway.")
        var runway: String
    }

    func call(arguments: Arguments) async throws -> String {
        OnDeviceTools.run(name, log: log) { try FieldFigures.crosswind(arguments.ident, runway: arguments.runway, facts: facts) }
    }
}

struct FuelTool: Tool {
    let name = "fuel"
    let description = "The plan's fuel, the fuel the plan leaves at the destination from here, and the endurance of the fuel on board."
    let facts: OnDeviceFacts
    let log: FigureLog

    @Generable
    struct Arguments {
        @Guide(description: "The gallons on board if the pilot says them; 0 when not said.")
        var onBoardGal: Double
    }

    func call(arguments: Arguments) async throws -> String {
        OnDeviceTools.run(name, log: log) { try FlightFigures.fuel(onBoardGal: arguments.onBoardGal > 0 ? arguments.onBoardGal : nil, facts: facts) }
    }
}

struct GlideTool: Tool {
    let name = "glide"
    let description = "How far the airplane glides in still air from its GPS altitude."
    let facts: OnDeviceFacts
    let log: FigureLog

    @Generable
    struct Arguments {
        @Guide(description: "Leave empty.")
        var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        OnDeviceTools.run(name, log: log) { try FlightFigures.glide(facts: facts) }
    }
}

struct NearestFieldsTool: Tool {
    let name = "nearestFields"
    let description = "The airports nearest the airplane, with their distance and course, from the FAA data kept on this iPhone."
    let facts: OnDeviceFacts
    let log: FigureLog
    var pins: FlightFigures.Pins = FlightFigures.packPins

    @Generable
    struct Arguments {
        @Guide(description: "Leave empty.")
        var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        OnDeviceTools.run(name, log: log) { try FlightFigures.nearest(facts: facts, pins: pins) }
    }
}
