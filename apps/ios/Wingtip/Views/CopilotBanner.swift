import SwiftUI

/// The in-flight copilot's one message (Copilot), over the map under
/// what is ahead: its line, a tap opening the why and where each figure
/// comes from (the METAR, 14 CFR, ITWS ...), look and go; under it, More
/// Info for the field it is about and its one fix, Direct To the field
/// the engine picked, where it gave one (AlertActions). OK puts that
/// message away and a new one comes in its place. Nothing while the
/// first thing that matters is one the alerts banner already shows.
struct CopilotBanner: View {
    @Environment(\.appCommand) private var appCommand
    @State private var open = false
    @Environment(Copilot.self) private var copilot

    var body: some View {
        if let message = copilot.message, !message.elsewhere {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                HStack(alignment: open ? .top : .center, spacing: WingtipSpace.sm) {
                    Image(systemName: Self.symbol(message.level)).foregroundStyle(Self.ink(message.level))
                        .accessibilityLabel(message.level.capitalized)
                    Button { open.toggle() } label: {
                        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                            Text(message.title).font(.subheadline.weight(.semibold)).foregroundStyle(Self.ink(message.level))
                                .lineLimit(open ? nil : 2).multilineTextAlignment(.leading)
                            if open {
                                ForEach(message.detail, id: \.self) { Text($0).font(.subheadline) }
                                ForEach(message.sources, id: \.self) { Text($0).font(.footnote).foregroundStyle(.secondary) }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(open ? "Folds the reasons" : "Shows why")
                    Button("OK") {
                        copilot.dismiss()
                        open = false
                    }
                    .fontWeight(.semibold)
                    // The 44-point hit area round the word, which does not grow.
                    .contentShape(Rectangle().inset(by: -12))
                }
                actions(message)
            }
            .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
            .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.banner))
            .padding(.horizontal, WingtipSpace.md)
            .accessibilityElement(children: .contain)
        }
    }

    /// The message's fix, then its field's card, where it has either.
    @ViewBuilder private func actions(_ message: Copilot.Message) -> some View {
        let fix = AlertActions.fix(message)
        let target = AlertActions.target(message)
        if fix != nil || target != nil {
            HStack(spacing: WingtipSpace.sm) {
                if let fix {
                    Button(fix.label, systemImage: WingtipIcon.directTo) { appCommand(AlertActions.command(fix)) }
                        .fontWeight(.semibold)
                }
                if let target {
                    Button("More Info", systemImage: "info.circle") { appCommand(AlertActions.command(target)) }
                }
            }
            .font(.subheadline)
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
        }
    }

    /// A warning's octagon, a caution's triangle, an advisory's circle:
    /// the level told by its shape as well as its ink.
    static func symbol(_ level: String) -> String {
        switch level {
        case "warning": "exclamationmark.octagon.fill"
        case "caution": "exclamationmark.triangle.fill"
        default: "info.circle.fill"
        }
    }

    static func ink(_ level: String) -> Color {
        switch level {
        case "warning": WingtipInk.problem
        case "caution": WingtipInk.caution
        default: Color.primary
        }
    }
}

/// Setup's Alerts: the in-flight copilot off, shown or said aloud, a pick
/// of three, segmented (docs/decisions/0017), as the web's Map menu has it.
struct CopilotModePicker: View {
    @Environment(Copilot.self) private var copilot
    var body: some View {
        Picker("Copilot", selection: Binding(get: { copilot.mode }, set: { copilot.mode = $0 })) {
            ForEach(Copilot.Mode.allCases) { Text($0.label).tag($0) }
        }
        .pickerStyle(.segmented)
    }
}

#Preview("CopilotBanner") {
    VStack { CopilotBanner(); Spacer() }
}
