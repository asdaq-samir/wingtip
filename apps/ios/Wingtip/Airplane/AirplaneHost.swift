import SwiftUI

/// The airplanes' figures kept in step with who is signed in, on the root
/// view: the types' books once a launch, the pilot's records as they sign
/// in or out (the N-number flown taking its record's figures), and at
/// sign-in the figures kept on this device while signed out offered to the
/// account, as the owner asked (2026-11-09). The offer itself is asked
/// from the top of the stack (AirplaneFigureAlerts), not the map under
/// the plan's sheet, where an alert would never show.
struct AirplaneHost: ViewModifier {
    @Environment(Airplanes.self) private var airplanes
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session

    func body(content: Content) -> some View {
        content
            .task { await airplanes.loadBooks() }
            .task(id: session.signedIn) {
                await airplanes.loadRecords(signedIn: session.signedIn)
                plan.took(records: airplanes.records)
                if session.signedIn { FigureOffer.shared.offered = OwnFigureStore.tails() }
            }
    }
}

/// The N-numbers whose figures this device kept, offered at sign-in, and
/// why any could not be saved.
@MainActor
@Observable
final class FigureOffer {
    static let shared = FigureOffer()
    var offered: [String: Figures] = [:]
    var problem: String?
}

/// The offer and its failure, two stock alerts, from the top of the
/// stack (TopHosts).
struct AirplaneFigureAlerts: ViewModifier {
    @Environment(Airplanes.self) private var airplanes
    /// Whether this view is the top of the stack, the one that presents.
    let active: Bool
    @Environment(Plan.self) private var plan
    @Environment(FigureOffer.self) private var offer

    func body(content: Content) -> some View {
        let offered = offer.offered
        content
            .alert(Self.title(offered), isPresented: Binding(get: { active && !offer.offered.isEmpty }, set: { if !$0 { offer.offered = [:] } })) {
                Button("Save to Account") { Task { await keep() } }
                Button("Keep on This iPhone", role: .cancel) { offer.offered = [:] }
            } message: {
                Text("You set figures for \(offered.keys.sorted().joined(separator: ", ")) while signed out. Save them with your airplanes?")
            }
            .alert("Figures Not Saved", isPresented: Binding(get: { active && offer.problem != nil }, set: { if !$0 { offer.problem = nil } })) {
                Button("OK", role: .cancel) { offer.problem = nil }
            } message: {
                Text(offer.problem ?? "")
            }
    }

    static func title(_ offered: [String: Figures]) -> String {
        offered.count == 1 ? "Save \(offered.keys.first ?? "")'s Figures?" : "Save Your Airplanes' Figures?"
    }

    /// Each N-number's figures saved to the account over its record's, or
    /// as a new record from its type's book; the device's copy forgotten
    /// once the account has them.
    private func keep() async {
        let tails = offer.offered
        offer.offered = [:]
        var failed: [String] = []
        for (tail, figures) in tails.sorted(by: { $0.key < $1.key }) {
            let record = airplanes.record(tail)
            // Over the record's own, the device's where they differ.
            var merged = record.map(Figures.init) ?? Figures()
            for figure in OwnFigure.allCases { if let v = figures[figure] { merged[figure] = v } }
            // A new record starts from its registered type's book, where the
            // planner has one.
            let registered = record == nil ? try? await Planner.registered(tail) : nil
            let stock = registered.flatMap { try? Registered.profile(manufacturer: $0.manufacturer, model: $0.model, year: $0.year) }
            let aircraft = plan.tail?.uppercased() == tail ? plan.aircraft : (stock ?? Plan.ownAirplane)
            do {
                let (saved, kept) = try await airplanes.save(merged, tail: tail, aircraft: aircraft, type: nil, signedIn: true)
                if case .device(let why) = kept { failed.append(why ?? tail) } else { OwnFigureStore.forget(tail) }
                plan.took(saved, for: tail)
            } catch {
                failed.append("\(tail): \(error.localizedDescription)")
            }
        }
        if !failed.isEmpty { offer.problem = failed.joined(separator: "\n") }
    }
}
