import SwiftUI

/// The pilot's saved flights: each a tap back onto the page, a swipe
/// away, and the plan on the page saved with the button at the top.
struct FlightsView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    /// The iPad's inspector's close, where it holds the list (SplitLayout).
    @Environment(\.closeCard) private var closeCard
    @State private var flights: [SavedFlight] = []
    @State private var problem: String?
    @State private var saving = false
    /// The flight just deleted, kept back until its Undo is gone.
    @State private var removed: (flight: SavedFlight, at: Int)?

    var body: some View {
        List {
            if !session.signedIn {
                ContentUnavailableView("Sign in to save flights", systemImage: "person.crop.circle", description: Text("Your flights are kept with your account, on every device."))
            } else if flights.isEmpty {
                ContentUnavailableView("No saved flights", systemImage: "tray", description: Text("Save the plan on the page with the button above."))
            }
            if let removed {
                UndoRow(words: "Removed \(Self.route(removed.flight))", undo: {
                    flights.insert(removed.flight, at: min(removed.at, flights.count))
                    self.removed = nil
                }, done: { keep(removed.flight) })
            }
            ForEach(flights) { flight in
                Button {
                    plan.open(flight)
                    if let closeCard { closeCard() } else { dismiss() }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Self.route(flight)).font(.headline.monospaced())
                        HStack(spacing: WingtipSpace.md) {
                            if let nm = flight.totalDistanceNm { Text(Format.distance(nm, decimals: 0)) }
                            if let min = flight.totalEteMin { Text(Format.duration(min)) }
                            if let gal = flight.totalFuelGal { Text(Format.fuel(gal)) }
                            if let tail = flight.aircraftTailNumber { Text(tail) }
                        }
                        .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .foregroundStyle(.primary)
                // Its flown track: the profile, on the map, from a GPX file.
                // Its flown track a swipe away as well as held (its
                // replay, its profile and its debrief), and Delete with its Undo.
                .contextMenu {
                    flownTrack(flight)
                    Button("Delete", systemImage: "trash", role: .destructive) { delete(flight) }
                }
                .swipeActions(edge: .leading) { flownTrack(flight).tint(.accentColor) }
                .swipeActions(edge: .trailing) {
                    Button("Delete", systemImage: "trash", role: .destructive) { delete(flight) }
                }
            }
            ProblemLine(problem)
        }
        .navigationTitle("Saved Flights")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(saving ? "Saving…" : "Save This Plan") {
                    guard let request = plan.saved() else { return }
                    saving = true
                    Task {
                        do { try await Gateway.save(request); flights = try await Gateway.flights(); problem = nil }
                        catch { problem = error.localizedDescription }
                        saving = false
                    }
                }
                .disabled(saving || !session.signedIn || plan.totals == nil)
            }
        }
        .task(id: session.signedIn) {
            do { flights = try await Gateway.flights() } catch { problem = error.localizedDescription }
        }
        // Left with an Undo still up: the delete kept.
        .onDisappear { if let removed { keep(removed.flight) } }
    }
}

#Preview("FlightsView") {
    NavigationStack { FlightsView() }
        .environment(Plan())
        .environment(Session())
}

extension FlightsView {
    static func route(_ flight: SavedFlight) -> String {
        ([flight.departureIdent] + flight.stops + [flight.destinationIdent]).joined(separator: " → ")
    }

    func flownTrack(_ flight: SavedFlight) -> some View {
        Button { FlightUI.shared.card = .flown(flight.id, Self.route(flight)) } label: {
            Label("Flown Track", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
        }
    }

    /// Taken off the list at once, deleted once its Undo is gone: an Undo
    /// puts it back with nothing asked of the gateway.
    func delete(_ flight: SavedFlight) {
        if let removed { keep(removed.flight) }
        guard let at = flights.firstIndex(where: { $0.id == flight.id }) else { return }
        flights.remove(at: at)
        removed = (flight, at)
    }

    func keep(_ flight: SavedFlight) {
        if removed?.flight.id == flight.id { removed = nil }
        Task { try? await Gateway.deleteFlight(flight.id) }
    }
}
