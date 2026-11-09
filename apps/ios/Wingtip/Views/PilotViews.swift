import SwiftUI

/// The pilot's saved flights: each a tap back onto the page, named and
/// noted in its own row (Edit), a swipe away with its Undo, and the plan
/// on the page saved with the button at the top. Its state is the
/// model's (SavedFlightsModel).
struct FlightsView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    /// The iPad's inspector's close, where it holds the list (SplitLayout).
    @Environment(\.closeCard) private var closeCard
    @State private var model = SavedFlightsModel()

    var body: some View {
        List {
            if !session.signedIn {
                ContentUnavailableView("Sign in to save flights", systemImage: "person.crop.circle", description: Text("Your flights are kept with your account, on every device."))
            } else if model.flights.isEmpty {
                ContentUnavailableView("No saved flights", systemImage: "tray", description: Text("Save the plan on the page with the button above."))
            }
            if let removed = model.removed {
                UndoRow(words: "Removed \(SavedFlightsModel.title(removed.flight))", undo: model.undo,
                        done: { Task { await model.keep(removed.flight) } })
            }
            ForEach(model.flights) { flight in
                if model.editingID == flight.id {
                    SavedFlightEditRow(model: model, route: SavedFlightsModel.route(flight))
                } else {
                    Button {
                        plan.open(flight)
                        if let closeCard { closeCard() } else { dismiss() }
                    } label: {
                        SavedFlightRow(flight: flight)
                    }
                    .foregroundStyle(.primary)
                    // Held: Edit, its flown track (its replay, its profile
                    // and its debrief) and Delete with its Undo; the same
                    // a swipe away, Edit and Flown Track to the right.
                    .contextMenu {
                        editButton(flight)
                        shareButtons(flight)
                        flownTrack(flight)
                        Button("Delete", systemImage: "trash", role: .destructive) { model.delete(flight) }
                    }
                    .swipeActions(edge: .leading) {
                        flownTrack(flight).tint(.accentColor)
                        editButton(flight)
                    }
                    .swipeActions(edge: .trailing) {
                        Button("Delete", systemImage: "trash", role: .destructive) { model.delete(flight) }
                    }
                }
            }
            ProblemLine(model.problem)
        }
        .navigationTitle("Saved Flights")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    guard let request = plan.saved() else { return }
                    Task { await model.save(request) }
                } label: {
                    SaveLabel(title: "Save This Plan", saving: model.saving, saves: model.saves)
                }
                .disabled(model.saving || !session.signedIn || plan.totals == nil)
            }
        }
        .task(id: session.signedIn) { await model.load() }
        .sheet(item: $model.sendingLink) { ActivityView(items: [$0.url]).presentationDetents([.medium, .large]) }
        // Left with an Undo still up: the delete kept.
        .onDisappear { if let removed = model.removed { Task { await model.keep(removed.flight) } } }
    }

    private func editButton(_ flight: SavedFlight) -> some View {
        Button("Edit", systemImage: "pencil") { model.edit(flight) }
    }

    /// Share… by link, the N-number with it only where the pilot picks so;
    /// Stop Sharing once shared, which ends the link for everyone.
    @ViewBuilder private func shareButtons(_ flight: SavedFlight) -> some View {
        if let tail = flight.aircraftTailNumber {
            Menu {
                Button("Share Link") { Task { await model.share(flight, includeTail: false) } }
                Button("Share Link with \(tail)") { Task { await model.share(flight, includeTail: true) } }
            } label: { Label("Share…", systemImage: "square.and.arrow.up") }
        } else {
            Button("Share…", systemImage: "square.and.arrow.up") { Task { await model.share(flight, includeTail: false) } }
        }
        if flight.share != nil {
            Button("Stop Sharing", systemImage: "xmark.circle") { Task { await model.stopSharing(flight) } }
        }
    }

    private func flownTrack(_ flight: SavedFlight) -> some View {
        Button { FlightUI.shared.card = .flown(flight.id, SavedFlightsModel.route(flight)) } label: {
            Label("Flown Track", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
        }
    }
}

/// A saved flight as listed: its name (else its route), the route under
/// a name, the figures, and its notes.
struct SavedFlightRow: View {
    let flight: SavedFlight

    var body: some View {
        let route = SavedFlightsModel.route(flight)
        let title = SavedFlightsModel.title(flight)
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text(title).font(title == route ? .headline.monospaced() : .headline)
            if title != route { Text(route).font(.subheadline.monospaced()).foregroundStyle(.secondary) }
            HStack(spacing: WingtipSpace.md) {
                if let nm = flight.totalDistanceNm { Text(Format.distance(nm, decimals: 0)) }
                if let min = flight.totalEteMin { Text(Format.duration(min)) }
                if let gal = flight.totalFuelGal { Text(Format.fuel(gal)) }
                if let tail = flight.aircraftTailNumber { Text(tail) }
            }
            .font(.footnote).foregroundStyle(.secondary)
            if let notes = flight.notes, !notes.isEmpty {
                Text(notes).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
        }
    }
}

/// A saved flight's row open for its name and notes: Return in the name,
/// or Save, keeps both; Cancel leaves them; why it was not kept is said here.
struct SavedFlightEditRow: View {
    @Bindable var model: SavedFlightsModel
    let route: String
    @FocusState private var nameFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            Text(route).font(.subheadline.monospaced()).foregroundStyle(.secondary)
            TextField("Name", text: $model.name, prompt: Text(route))
                .font(.headline)
                .focused($nameFocused)
                .submitLabel(.done)
                .onSubmit { Task { await model.commitEdit() } }
            TextField("Notes", text: $model.notes, axis: .vertical)
                .lineLimit(1...6)
            HStack(spacing: WingtipSpace.md) {
                Button(model.sending ? "Saving…" : "Save") { Task { await model.commitEdit() } }
                    .fontWeight(.semibold)
                    .disabled(model.sending)
                Button("Cancel", role: .cancel) { model.cancelEdit() }
                Spacer(minLength: 0)
            }
            .buttonStyle(.borderless)
            ProblemLine(model.rowProblem)
        }
        .onAppear { nameFocused = true }
    }
}

#Preview("FlightsView") {
    NavigationStack { FlightsView() }
        .environment(Plan())
        .environment(Session())
}
