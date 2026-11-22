import SwiftUI

/// One of the app's windows: on an iPad there can be several (iPadOS's
/// windows, Stage Manager, an external display; HIG Multitasking: "every
/// app needs to work well with multitasking"), each its own map, sidebar
/// and cards (its own Navigator and search, RootView), over the one flight
/// the app plans (ScreenModels), so a route made in one is in all. The
/// app's loops (AppLoops) run in one window alone, the lead (WindowLead),
/// so two windows never read the receiver, send the track or watch the
/// weather twice. The owner, 2026-11-21: "Yes do it all for iPad".
struct MainWindow: View {
    let session: Session
    let charts: Charts
    let screens: ScreenModels
    @State private var nav: Navigator
    @State private var id = UUID()
    private var lead: WindowLead { screens.windows }

    init(session: Session, charts: Charts, screens: ScreenModels) {
        self.session = session
        self.charts = charts
        self.screens = screens
        let nav = Navigator()
        nav.screens = screens
        _nav = State(initialValue: nav)
    }

    var body: some View {
        let leads = lead.leads(id)
        RootView()
            // Every list's section titles the system's prominent ones,
            // 20 points in the text colour (the owner's "section titles
            // 20 pt", docs/decisions/0021), drawn by the system rather
            // than a hand-built title (the owner, 2026-11-10).
            .headerProminence(.increased)
            // An emailed sign-in link asks before it signs anyone in.
            .modifier(LinkSignInPrompt(session: session))
            .environment(\.leadsLoops, leads)
            .background {
                if leads { AppLoops(session: session, charts: charts, screens: screens) }
            }
            .modifier(AppModels(session: session, charts: charts, nav: nav, screens: screens))
            // Held while the window is: a window shut hands the loops on.
            .task {
                lead.join(id)
                await heldUntilCancelled()
                lead.leave(id)
            }
    }
}

/// Which window runs the app's loops: the first open, then, as it shuts,
/// the next (MainWindow). One for the app (ScreenModels).
@MainActor
@Observable
final class WindowLead {
    private(set) var windows: [UUID] = []

    func join(_ id: UUID) {
        if !windows.contains(id) { windows.append(id) }
    }

    func leave(_ id: UUID) {
        windows.removeAll { $0 == id }
    }

    func leads(_ id: UUID) -> Bool { windows.first == id }
}

extension EnvironmentValues {
    /// Set in the lead window (WindowLead): the flight's own loops over
    /// the map (FlightLoops) run there alone.
    @Entry var leadsLoops = true
}

/// Until the task is cancelled: a view's `.task` held for as long as the
/// view is up.
private func heldUntilCancelled() async {
    while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(3600))
    }
}
