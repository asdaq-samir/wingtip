import SwiftUI

/// The pilot's own airplanes (the web app's AircraftPanel): a row each,
/// the one the nav log flies ticked, a tap opening its figures to edit,
/// and New Airplane at the top. Each airplane's page has its checklist,
/// squawks, inspections and VOR check, and Delete, asked first. You's
/// Airplanes row (the owner, 2026-11-13): the picked airplane's Checklists
/// inside it, kept on this device, so signed out too.
struct OwnAircraftListView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @State private var list: [OwnAircraftRecord]?
    @State private var problem: String?
    @State private var adding = false

    var body: some View {
        List {
            if !session.signedIn {
                Text("Sign in to keep your airplanes.").foregroundStyle(.secondary)
            } else if let list {
                if list.isEmpty {
                    ContentUnavailableView("No Airplanes", systemImage: "airplane", description: Text("Add yours with its handbook's figures."))
                }
                ForEach(list) { airplane in
                    NavigationLink {
                        OwnAircraftPage(record: airplane, onChange: { Task { await load() } })
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                HStack(spacing: WingtipSpace.sm) {
                                    Text(airplane.tailNumber).font(.headline.monospaced()).appEntityIdentifier(SiriSaw.airplane(airplane.tailNumber))
                                    Text(airplane.typeDesignator).foregroundStyle(.secondary)
                                }
                                Text(OwnAircraftPage.figuresLine(airplane)).font(.footnote).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if plan.tail == airplane.tailNumber.uppercased() { Image(systemName: "checkmark").foregroundStyle(.tint).accessibilityLabel("Flying now") }
                        }
                    }
                }
            } else if problem == nil {
                ProgressView()
            }
            ProblemLine(problem)
            Section {
                NavigationLink { ChecklistsPage() } label: {
                    LabeledContent {
                        if let name = plan.airplaneName { Text(name) }
                    } label: {
                        SettingsLabel(Screen.checklists.title, systemImage: "checklist", colour: WingtipColor.Badge.ground)
                    }
                }
                .accessibilityIdentifier("checklists-row")
            }
        }
        .navigationTitle("Your Airplanes")
        .toolbar {
            if session.signedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Label("New Airplane", systemImage: "plus") }
                }
            }
        }
        .sheet(isPresented: $adding) {
            NavigationStack { AircraftFormView(record: nil) { _ in Task { await load() } } }
        }
        .task { if session.signedIn { await load() } }
    }

    private func load() async {
        do { list = try await Gateway.aircraftRecords(); problem = nil } catch { problem = error.localizedDescription }
    }
}
