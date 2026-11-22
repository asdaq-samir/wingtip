import SwiftUI

/// Settings' Extras, after In Flight (the feature review, taken by the
/// owner 2026-11-21; the web's ExtrasGroup): the parked features, a stock
/// switch each with its one line, all off until turned on (Extra). Kept in
/// the app but out of a pilot's way and out of the store listing.
struct ExtrasSection: View {
    var body: some View {
        Section("Extras") {
            ForEach(Extra.allCases) { ExtraToggle(extra: $0) }
        }
    }
}

/// One parked feature's switch, kept under its own key.
private struct ExtraToggle: View {
    let extra: Extra
    @AppStorage private var on: Bool

    init(extra: Extra) {
        self.extra = extra
        _on = AppStorage(wrappedValue: false, extra.key)
    }

    var body: some View {
        Toggle(isOn: $on) {
            Text(extra.title)
            Text(extra.detail)
        }
        .accessibilityIdentifier("extras-\(extra.rawValue)")
        .onChange(of: on) { _, on in if !on { Self.letGo(extra) } }
    }

    /// What a feature has running, let go as its switch goes off; the rest
    /// read the switch where they start (the copilot's listening as the
    /// flight's loop next looks, the receiver within its second).
    private static func letGo(_ extra: Extra) {
        switch extra {
        case .atcCopilot:
            if ClearanceListener.shared.listening { ClearanceListener.shared.stop() }
        case .modelWeather:
            ModelWeather.shared.field = .off
        case .adsbReceiver, .otherAirplanes, .trainingTools:
            break
        }
    }
}

#Preview("ExtrasSection") {
    NavigationStack { List { ExtrasSection() }.listStyle(.insetGrouped) }
}
