import SwiftUI

/// The pilot's saved flights: each a tap back onto the page, named and
/// noted in its own row (Edit), a swipe away with the system's Undo, and the plan
/// on the page saved with the button at the top. Its state is the
/// model's (SavedFlightsModel).
struct FlightsView: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(\.undoManager) private var undoManager
    @State private var model = SavedFlightsModel()

    var body: some View {
        List {
            if !session.signedIn {
                ContentUnavailableView("Sign in to save flights", systemImage: "person.crop.circle", description: Text("Your flights are kept with your account, on every device."))
            } else if model.flights.isEmpty {
                ContentUnavailableView("No saved flights", systemImage: "tray", description: Text("Save the plan on the page with the button above."))
            }
            ForEach(model.flights) { flight in
                if model.editingID == flight.id {
                    SavedFlightEditRow(model: model, route: SavedFlightsModel.route(flight))
                } else {
                    Button {
                        plan.open(flight)
                        // The flight on the plan, its card put away.
                        Navigator.shared.showPlan()
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
                        Button("Delete", systemImage: "trash", role: .destructive) { model.delete(flight, undo: undoManager) }
                    }
                    .swipeActions(edge: .leading) {
                        flownTrack(flight).tint(accent)
                        editButton(flight)
                    }
                    .swipeActions(edge: .trailing) {
                        Button("Delete", systemImage: "trash", role: .destructive) { model.delete(flight, undo: undoManager) }
                    }
                }
            }
            ProblemLine(model.problem)
        }
        .navigationTitle("Saved Flights")
        .toolbar {
            UndoToolbarItem()
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    guard let request = plan.saved() else { return }
                    Task { await model.save(request) }
                } label: {
                    Text(model.saving ? "Saving…" : "Save This Plan")
                }
                .disabled(model.saving || !session.signedIn || plan.totals == nil)
            }
        }
        .task(id: session.signedIn) { await model.load() }
        // Left with deletes still to undo: they are sent, and their Undo goes.
        .onDisappear {
            undoManager?.forget(model)
            if !model.removed.isEmpty { Task { await model.keepRemoved() } }
        }
    }

    private func editButton(_ flight: SavedFlight) -> some View {
        Button("Edit", systemImage: "pencil") { model.edit(flight) }
    }

    /// Share… by link, the N-number with it only where the pilot picks so:
    /// the system's ShareLink, the gateway making the link when the share
    /// sheet asks for it (SharedLink). Stop Sharing once shared, which ends
    /// the link for everyone.
    @ViewBuilder private func shareButtons(_ flight: SavedFlight) -> some View {
        let share = Label("Share…", systemImage: "square.and.arrow.up")
        if let tail = flight.aircraftTailNumber {
            Menu {
                shareLink(flight, includeTail: false) { Text("Share Link") }
                shareLink(flight, includeTail: true) { Text("Share Link with \(tail)") }
            } label: { share }
        } else {
            shareLink(flight, includeTail: false) { share }
        }
        if flight.share != nil {
            Button("Stop Sharing", systemImage: "xmark.circle") { Task { await model.stopSharing(flight) } }
        }
    }

    private func shareLink(_ flight: SavedFlight, includeTail: Bool, @ViewBuilder label: () -> some View) -> some View {
        ShareLink(item: SharedLink { [model] in try await model.link(flight, includeTail: includeTail) },
                  preview: SharePreview(SavedFlightsModel.title(flight)), label: label)
    }

    private func flownTrack(_ flight: SavedFlight) -> some View {
        Button { Navigator.shared.push(.flown(flight.id, SavedFlightsModel.route(flight))) } label: {
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
