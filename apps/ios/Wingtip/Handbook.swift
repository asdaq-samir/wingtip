import Foundation
import UIKit
import Vision

/// The planning figures on a handbook's specifications page, read off a
/// photo of it on the phone: Apple's Vision reads the words (no key, no
/// server, works offline), and the engine's `handbook_figures` (the web
/// app's lib/handbookText) finds the figures by their labels, in knots
/// where the page prints mph. Each comes with the line
/// it was read from, for the pilot to check against the page before
/// saving; one the page does not label plainly is not guessed.
enum Handbook {
    typealias Figure = EngineContract.HandbookFigure

    /// The engine's answer, camel case: a figure the page does not label
    /// plainly is left out.
    typealias Figures = EngineContract.HandbookFiguresAnswer
}

extension Handbook.Figures {
    var isEmpty: Bool { cruiseTasKt == nil && cruisePowerPct == nil && fuelBurnGph == nil && usableFuelGal == nil && climbTasKt == nil && serviceCeilingFt == nil }
    var words: [String] { [cruiseTasKt, cruisePowerPct, fuelBurnGph, usableFuelGal, climbTasKt, serviceCeilingFt].compactMap { $0?.words } }
}

extension Handbook {

    /// The words on the page, top to bottom, one line each.
    static func read(_ image: UIImage) async throws -> String {
        guard let cg = image.cgImage else { return "" }
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        let observations = try await request.perform(on: cg, orientation: .up)
        // Top to bottom: Vision's boxes have their origin at the bottom.
        return observations.sorted { $0.boundingBox.origin.y > $1.boundingBox.origin.y }
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
    }

    /// The figures on the page's text; thrown where the engine cannot
    /// answer, which the page says.
    static func figures(of text: String) throws -> Figures {
        try Engine.handbookFigures(text: text)
    }
}
