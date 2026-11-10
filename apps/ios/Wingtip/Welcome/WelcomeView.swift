import SwiftUI

/// The welcome: one card over the map at the sheet's medium height, not a
/// carousel (docs/design/ios.md §14; HIG Onboarding, HIG Launching): its
/// title, one line, the one filled button, Search an Airport, which puts
/// the card away and focuses the one search, and Not Now, plain. A
/// sample flight is offered beside them for a pilot who wants to look
/// first. Nothing is asked: the airplane, the account and the
/// permissions are each asked where they are first wanted.
struct WelcomeView: View {
    let model: WelcomeModel
    /// The sample flight opened: the sheet's plan shown (WelcomeHost).
    let opened: () -> Void
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
            Spacer(minLength: 0)
            Button { model.searchAnAirport() } label: {
                Label("Search an Airport", systemImage: "magnifyingglass").frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
            }
            .glassProminentButton()
            .accessibilityIdentifier("welcome-search")
            HStack {
                Button("See a Sample Flight") { model.openSample(plan); opened() }
                    .accessibilityIdentifier("welcome-sample")
                Spacer()
                Button("Not Now") { model.finish() }
                    .accessibilityIdentifier("welcome-skip")
            }
            .frame(minHeight: WingtipSize.tapTarget)
        }
        .padding(WingtipSpace.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Shows the welcome once per install, over whichever sheet holds the
/// planner (one view presents one sheet at a time), at the medium detent
/// so the chart stays in sight: a moment after launch, once the planner's
/// own sheet is up. Pulled down, it counts as Not Now.
struct WelcomeHost: ViewModifier {
    let opened: () -> Void
    private var model: WelcomeModel { .shared }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding(get: { model.presented }, set: { if !$0 { model.finish() } })) {
                ScrollView { WelcomeView(model: model, opened: opened) }
                    .scrollBounceBehavior(.basedOnSize)
                    .presentationDetents([.medium, .large])
                    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
            }
            .task {
                try? await Task.sleep(for: .milliseconds(600))
                model.showIfWanted()
            }
    }
}
