import SwiftUI

/// Help Improve Wingtip Maps, Help & About's switch: whether this iPhone
/// sends the gateway MetricKit's daily figures and its crash, hang and
/// exception diagnostics (DiagnosticsReporter), which carry nothing of the
/// pilot's (docs/privacy-inventory.md, Diagnostics). On unless the pilot
/// turns it off, as on the web and Android; off, nothing more is sent.
/// Kept on the phone, not with the account: a report is no one's.
enum HelpImprove {
    static let key = "diagnostics.helpImprove"

    /// Whether a report may go now; on where nothing was ever set.
    static func allows(_ defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: key) as? Bool ?? true
    }
}

/// The switch, with what it sends under it.
struct HelpImproveToggle: View {
    @AppStorage(HelpImprove.key) private var on = true

    var body: some View {
        Section {
            Toggle("Help Improve Wingtip Maps", isOn: $on)
                .accessibilityIdentifier("help-improve-toggle")
        } footer: {
            Text("Sends crashes and speed figures, with nothing of yours.")
        }
    }
}

#Preview("HelpImproveToggle") {
    Form { HelpImproveToggle() }
}
