import Foundation

extension AircraftForm {
    /// The altitude an airplane's cruise figures are given at, standard
    /// day, the engine's (`planning_figures`), so the form's heading says
    /// what the typed figures mean; thrown where the engine cannot say.
    static func cruiseReferenceFt() throws -> Double {
        try Engine.planningFigures().cruiseReferenceFt
    }
}
