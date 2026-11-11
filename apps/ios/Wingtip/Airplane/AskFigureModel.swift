import Foundation
import Observation

/// One inline ask's state (AskFigureRow): which input to ask for where a
/// figure is needed and the airplane lacks it (the engine's
/// airplane_needs), the pilot's answer as typed, and its Save -- to the
/// airplane's record, or this device signed out -- after which the plan is
/// worked out again with it. "Not Now" leaves that figure out for the
/// session, everything else still shown (the owner, 2026-11-09: "ask for
/// it at the time it's needed").
@MainActor
@Observable
final class AskFigureModel {
    /// What the row asks.
    enum Ask: Equatable {
        /// No airplane picked: the picker (PickAirplaneRow).
        case pick
        /// A figure, answered in place.
        case figure(OwnFigure)
        /// A table of the handbook's (its loading, its takeoff or landing
        /// chart), not typed in a line: a link to the airplane's profile.
        case table(String)
    }

    /// The asks put off with Not Now, by airplane and input, for this
    /// launch of the app.
    private static var notNow: Set<String> = []

    var text = ""
    private(set) var saving = false
    private(set) var problem: String?
    /// Said after a save that was kept on this device though signed in.
    private(set) var note: String?

    /// The first input to ask for of those `missing` names, in their order,
    /// leaving out the ones put off: the picker with no airplane.
    static func ask(missing: [String], putOff: Set<String>, airplane: String) -> Ask? {
        if missing.contains("airplane") { return .pick }
        for input in missing where !putOff.contains("\(airplane)|\(input)") {
            if let figure = OwnFigure(rawValue: input) { return .figure(figure) }
            return .table(input)
        }
        return nil
    }

    /// The airplane's name for its asks: its N-number, else its type.
    static func airplane(_ plan: Plan) -> String { plan.airplaneName ?? "this airplane" }

    /// What to ask on the plan's airplane for these screens' figures, the
    /// first of them that lacks one; thrown where the engine cannot say
    /// what the airplane lacks.
    func ask(_ needs: [AirplaneNeed], plan: Plan, airplanes: Airplanes = .shared) throws -> Ask? {
        let missing = try needs.flatMap { try airplanes.missing($0, plan: plan) }
        var seen = Set<String>()
        return Self.ask(missing: missing.filter { seen.insert($0).inserted }, putOff: Self.notNow, airplane: Self.airplane(plan))
    }

    /// The figure left out for this session.
    func putOff(_ input: String, plan: Plan) {
        Self.notNow.insert("\(Self.airplane(plan))|\(input)")
        text = ""
        problem = nil
    }

    /// The typed answer as a number; nil where it is not one above zero
    /// (the gateway and the planner hold each to its own limits, and say so).
    static func number(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")).flatMap { $0 > 0 ? $0 : nil }
    }

    /// The answer saved where it belongs and flown at once.
    func save(_ figure: OwnFigure, plan: Plan, signedIn: Bool, airplanes: Airplanes = .shared) async {
        guard let value = Self.number(text) else {
            problem = "Give \(figure.label.lowercased()) as a number, in \(figure.unit.trimmingCharacters(in: CharacterSet(charactersIn: ": ")))."
            return
        }
        saving = true
        defer { saving = false }
        var figures = plan.figures
        figures[figure] = value
        do {
            let (saved, kept) = try await airplanes.save(figures, tail: plan.tail, aircraft: plan.aircraft, type: nil, signedIn: signedIn, added: [figure])
            if case .device(let why) = kept { note = why } else { note = nil }
            problem = nil
            text = ""
            plan.took(saved, for: plan.tail)
        } catch {
            problem = "\(figure.label) couldn't be saved: \(error.localizedDescription)"
        }
    }
}
