import SwiftUI

/// Where Ask's answers come from, at the top left of Ask (the close is at
/// the right): a menu, as discrete settings are (docs/decisions/0017),
/// with Automatic, The Planner and On This iPhone, kept on the device.
/// Under On This iPhone nothing leaves the phone: the engine on it works
/// every figure and Apple's on-device model, where it runs, words them.
///
/// Not there while the server's Claude features are off (ServerFeatures):
/// every answer is this iPhone's then, so there is nothing to pick.
struct AskWherePicker: View {
    @Environment(ServerFeatures.self) private var features
    @AppStorage(AskWhere.key) private var pick: AskWhere = .automatic

    var body: some View {
        if features.claudeOn { menu }
    }

    private var menu: some View {
        Menu {
            Picker("Answers From", selection: $pick) {
                ForEach(AskWhere.allCases) { pick in
                    Label(pick.title, systemImage: Self.symbol(pick)).tag(pick)
                }
            }
            // Why the model is not there, where it is not: the engine's
            // own words answer then.
            if let why = AppleModels.unavailableWhy {
                Text(why)
            }
        } label: {
            Image(systemName: Self.symbol(pick))
                .contentShape(Rectangle().inset(by: -8))
        }
        .accessibilityLabel("Answers from")
        .accessibilityValue(pick.title)
    }

    static func symbol(_ pick: AskWhere) -> String {
        switch pick {
        case .automatic: "antenna.radiowaves.left.and.right"
        case .planner: "server.rack"
        case .device: "iphone"
        }
    }
}

#Preview("AskWherePicker") {
    NavigationStack {
        Text("Ask").toolbar { ToolbarItem(placement: .topBarLeading) { AskWherePicker() } }
    }
}
