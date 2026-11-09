import SwiftUI

/// The welcome, one page a step (WelcomeModel): Skip at the top of every
/// page, the step's dots beside it, each page giving way to the next on
/// the motion token's page time (a cross-fade with Reduce Motion on).
struct WelcomeView: View {
    @Bindable var model: WelcomeModel
    /// The sample flight opened, or the pilot's own begun: the sheet's
    /// plan shown (RootView's WelcomeHost).
    let opened: () -> Void
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            ZStack {
                page(model.step)
                    .id(model.step)
                    .transition(reduceMotion ? .opacity : .asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)))
            }
            .animation(.easeOut(duration: WingtipMotion.page), value: model.step)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { dots }
                if model.step != .finish {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Skip") { model.skip() }.accessibilityIdentifier("welcome-skip")
                    }
                }
            }
        }
        .task {
            let location = await !Permission.undecided(.location)
            let notifications = await !Permission.undecided(.notifications)
            model.knowAnswered(location: location, notifications: notifications)
        }
    }

    /// Where the pilot is in the welcome, read as "Step 2 of 6".
    private var dots: some View {
        HStack(spacing: WingtipSpace.sm) {
            ForEach(WelcomeModel.Step.allCases, id: \.self) { step in
                Circle()
                    .fill(step == model.step ? AnyShapeStyle(.tint) : AnyShapeStyle(.quaternary))
                    .frame(width: 7, height: 7)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(model.step.rawValue + 1) of \(WelcomeModel.Step.allCases.count)")
    }

    @ViewBuilder
    private func page(_ step: WelcomeModel.Step) -> some View {
        switch step {
        case .airplane:
            WelcomeAirplaneStep(model: model) { model.next() }
        case .home:
            WelcomeHomeStep(model: model) { model.next() }
        case .rules:
            WelcomePage(symbol: "cloud.sun", title: "VFR or IFR",
                        sentence: "Routes are planned under the rules you fly: the altitudes and the fuel reserve follow them.") {
                Picker("Flight Rules", selection: $model.rules) {
                    ForEach(FlightRules.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.top, WingtipSpace.sm)
            } actions: {
                continueButton
            }
        case .location:
            PermissionAsk(permission: .location, allow: { ownShip.askLocation(); model.next() }, notNow: { model.next() })
        case .notifications:
            PermissionAsk(permission: .notifications, allow: { Task { await Notifications.allow() }; model.next() }, notNow: { model.next() })
        case .finish:
            WelcomePage(symbol: "map", title: "Ready to Plan",
                        sentence: "See a flight from Madison to Oshkosh planned for you, or plan your own.") {
                EmptyView()
            } actions: {
                Button { model.openSample(plan); opened() } label: { Text("Open Sample Flight").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .accessibilityIdentifier("welcome-sample")
                Button { model.finish(); opened() } label: { Text("Plan My Own").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered).controlSize(.large)
            }
        }
    }

    private var continueButton: some View {
        Button { model.next() } label: { Text("Continue").frame(maxWidth: .infinity) }
            .buttonStyle(.borderedProminent).controlSize(.large)
    }
}

/// Shows the welcome once per install, over whichever sheet holds the
/// planner (one view presents one sheet at a time): a moment after
/// launch, once the planner's own sheet is up. Pulled down, it counts as
/// skipped.
struct WelcomeHost: ViewModifier {
    let opened: () -> Void
    private var model: WelcomeModel { .shared }

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding(get: { model.presented }, set: { if !$0 { model.finish() } })) {
                WelcomeView(model: model, opened: opened)
            }
            .task {
                try? await Task.sleep(for: .milliseconds(600))
                model.showIfWanted()
            }
    }
}
