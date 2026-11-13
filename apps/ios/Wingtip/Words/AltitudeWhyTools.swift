import Foundation
import FoundationModels

/// The tools Apple's on-device model calls to explain the altitude flown
/// (AltitudeWhy): each hands over one kind of the engine's reasons, with
/// the ids the sentences must cite, and logs what it handed over
/// (FigureLog), as OnDeviceTools does for Ask. The direction-of-flight
/// rule is in the prompt itself (AppleAltitudeWhy); three tools, not more:
/// the on-device model's context is small, and each tool's schema is in it.
enum AltitudeWhyTools {
    static func all(_ reasons: AltitudeWhy.Reasons, log: FigureLog) -> [any Tool] {
        [
            AltitudeReasonTool(name: "limits", description: "What bounds the altitude: the floor over terrain and obstacles, the airplane's ceiling, the clouds, Class B and the freezing level.",
                               figures: reasons.limits, log: log),
            AltitudeReasonTool(name: "plans", description: "The planner's plans by name, each with its altitude, time, fuel and wind.",
                               figures: reasons.winds, log: log),
            AltitudeReasonTool(name: "cautions", description: "The cautions on the altitude flown, leg by leg, where there are any.",
                               figures: reasons.cautions, log: log),
        ]
    }
}

/// One kind of the reasons, handed over as "[id] label: words" lines.
struct AltitudeReasonTool: Tool {
    let name: String
    let description: String
    let figures: [AskFigure]
    let log: FigureLog

    @Generable
    struct Arguments {
        @Guide(description: "Leave empty.")
        var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        OnDeviceTools.run(name, log: log) {
            guard !figures.isEmpty else { throw AskRefused(why: "None for this flight.") }
            return figures
        }
    }
}
