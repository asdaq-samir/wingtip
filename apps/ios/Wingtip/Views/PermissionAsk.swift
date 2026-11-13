import AVFoundation
import CoreLocation
import Speech
import SwiftUI
import UserNotifications

/// A permission the app asks for, said in one plain sentence before the
/// system's own question, which comes only on Allow; Not Now passes it
/// over (the HIG's "request permission only when it's needed", with the
/// app's reason first).
enum Permission: Sendable {
    case location, notifications, microphone

    var title: String {
        switch self {
        case .location: "Location"
        case .notifications: "Notifications"
        case .microphone: "Microphone"
        }
    }

    var sentence: String {
        switch self {
        case .location: "Wingtip plans from where you are and shows your airplane on the chart."
        case .notifications: "Wingtip tells you when something on your route changes: a TFR, the weather turning."
        case .microphone: "Wingtip listens to the radio to write down your clearance. Speech is recognised on this iPhone and never leaves it."
        }
    }

    var symbol: String {
        switch self {
        case .location: "location.fill"
        case .notifications: "bell.badge.fill"
        case .microphone: "mic.fill"
        }
    }

    /// Whether the system's question is still to be asked.
    @MainActor
    static func undecided(_ permission: Permission) async -> Bool {
        switch permission {
        case .location: CLLocationManager().authorizationStatus == .notDetermined
        case .notifications: await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .notDetermined
        case .microphone: AVAudioApplication.shared.recordPermission == .undetermined
            || SFSpeechRecognizer.authorizationStatus() == .notDetermined
        }
    }
}

/// One permission's page: its glyph, title and sentence, then Allow and
/// Not Now, shown where the permission is first wanted: the microphone's
/// sheet where the ATC copilot is turned on (AtcModePicker).
struct PermissionAsk: View {
    let permission: Permission
    let allow: () -> Void
    let notNow: () -> Void

    var body: some View {
        PermissionPage(symbol: permission.symbol, title: permission.title, sentence: permission.sentence) {
            EmptyView()
        } actions: {
            Button(action: allow) { Text("Allow").frame(maxWidth: .infinity) }
                .glassProminentButton().controlSize(.large)
            Button(action: notNow) { Text("Not Now").frame(maxWidth: .infinity) }
                .glassButton().controlSize(.large)
        }
        .accessibilityIdentifier("permission-\(permission.title.lowercased())")
    }
}

/// A permission's page: a glyph in the tint, the title, one sentence, what the
/// step holds, and its buttons at the foot, clear of the home indicator.
private struct PermissionPage<Content: View, Actions: View>: View {
    let symbol: String
    let title: String
    let sentence: String
    @ViewBuilder let content: Content
    @ViewBuilder let actions: Actions

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                Image(systemName: symbol)
                    .font(.system(.largeTitle))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text(title).font(WingtipType.hero).accessibilityAddTraits(.isHeader)
                Text(sentence).font(WingtipType.prose).foregroundStyle(.secondary)
                content
            }
            .padding(.horizontal, WingtipSpace.lg)
            .padding(.top, WingtipSpace.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .glassFoot {
            VStack(spacing: WingtipSpace.sm) { actions }
                .padding(.horizontal, WingtipSpace.lg)
                .padding(.vertical, WingtipSpace.md)
        }
    }
}
