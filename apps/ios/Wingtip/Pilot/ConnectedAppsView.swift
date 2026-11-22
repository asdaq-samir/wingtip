import SwiftUI

/// You's Connected Apps: each AI app the pilot connected to Wingtip
/// through its connector, one row a connection with Disconnect at its
/// trailing edge, as Settings lists a signed-in app. Disconnect asks first
/// (the system's confirmation dialog, destructive), then the app's next
/// call is refused and it must be connected again (ConnectionsController).
/// The web's ConnectedAppsPage on the iPhone and iPad.
struct ConnectedAppsView: View {
    @State private var model = ConnectedAppsModel()

    var body: some View {
        List {
            Section("AI Apps") {
                if model.failed {
                    Text("Your connected apps could not be read.").foregroundStyle(.secondary)
                } else if let apps = model.apps {
                    if apps.isEmpty {
                        Text("No apps are connected.").foregroundStyle(.secondary)
                    }
                    ForEach(apps, id: \.id) { app in row(app) }
                } else {
                    ProgressView()
                }
                ProblemLine(model.problem)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Connected Apps")
        .task { await model.load() }
        .refreshable { await model.load() }
        .confirmationDialog(
            "Disconnect \(model.asked?.app ?? "this app")?",
            isPresented: Binding(get: { model.asked != nil }, set: { if !$0 { model.asked = nil } }),
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) { Task { await model.confirm() } }
        } message: {
            Text("It can no longer read your airplanes or flights or save one, until you connect it again.")
        }
        .accessibilityIdentifier("connected-apps")
    }

    private func row(_ app: ConnectedApp) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(app.app)
                if let used = ConnectedAppsModel.lastUsed(app) {
                    Text(used).font(WingtipType.detail).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("Disconnect", role: .destructive) { model.asked = app }
                .buttonStyle(.borderless)
                .disabled(model.ending == app.id)
                .accessibilityIdentifier("disconnect-app")
        }
    }
}

#Preview("ConnectedAppsView") {
    NavigationStack { ConnectedAppsView() }
}
