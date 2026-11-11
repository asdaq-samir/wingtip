import SwiftUI

/// The welcome: one card over the plan at the sheet's medium height, its
/// own card (SheetPage.welcome), not a carousel (docs/design/ios.md §14; HIG Onboarding, HIG Launching): its
/// title, one line, the one filled button, Search an Airport, which puts
/// the card away and focuses the one search, and Not Now, plain. A
/// sample flight is offered beside them for a pilot who wants to look
/// first. Nothing is asked: the airplane, the account and the
/// permissions are each asked where they are first wanted.
struct WelcomeView: View {
    let model: WelcomeModel
    @Environment(Plan.self) private var plan

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            Image(systemName: "map")
                .font(.largeTitle)
                .foregroundStyle(.tint)
                .accessibilityHidden(true)
            Text("Plan Your First Flight").font(WingtipType.hero).accessibilityAddTraits(.isHeader)
            Text("Search for an airport to fly to or from; the chart, the weather and the route follow.")
                .font(WingtipType.prose).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button { model.searchAnAirport() } label: {
                Label("Search an Airport", systemImage: "magnifyingglass").frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
            }
            .glassProminentButton()
            .accessibilityIdentifier("welcome-search")
            HStack {
                Button("See a Sample Flight") { model.openSample(plan); Navigator.shared.showPlan() }
                    .accessibilityIdentifier("welcome-sample")
                Spacer()
                Button("Not Now") { model.finish() }
                    .accessibilityIdentifier("welcome-skip")
            }
            .frame(minHeight: WingtipSize.tapTarget)
        }
        .padding(WingtipSpace.lg)
        // In its card's scroll view, every row reachable at any text size.
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}
