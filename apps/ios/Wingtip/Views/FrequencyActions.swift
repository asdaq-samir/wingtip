import SwiftUI
import UIKit

/// What can be done with a frequency wherever one is shown (a field's
/// card and the strip's chips, the emergency's channels, the clearance and
/// ATC's calls): Copy, held or from VoiceOver's actions, for the radio
/// app, the panel or a note. There is no Tune: nothing the app talks to
/// sets a radio (the receiver is ADS-B and FIS-B in, the Bluetooth audio
/// a recording), so none is offered until something can.
enum FrequencyCopy {
    /// The figure alone, as it is dialled: "118.3" from "Tower 118.3".
    static func figure(in words: String) -> String? {
        words.split(separator: " ").last { $0.contains(".") && Double($0) != nil }.map(String.init)
    }

    @MainActor static func copy(_ figure: String) {
        UIPasteboard.general.string = figure
    }
}

/// Copy beside a frequency, as a button (the radio's card, where it
/// already stood as one).
struct FrequencyCopyButton: View {
    let figure: String

    var body: some View {
        Button("Copy \(figure)", systemImage: "doc.on.doc") { FrequencyCopy.copy(figure) }
    }
}

private struct FrequencyActions: ViewModifier {
    let figure: String?

    func body(content: Content) -> some View {
        if let figure {
            content
                // Held: Copy, over the figure itself large, as a context
                // menu previews what it acts on (HIG Context menus).
                .contextMenu {
                    FrequencyCopyButton(figure: figure)
                } preview: {
                    Text(figure).font(WingtipType.figure).padding(WingtipSpace.xl)
                }
                .accessibilityAction(named: "Copy \(figure)") { FrequencyCopy.copy(figure) }
        } else {
            content
        }
    }
}

extension View {
    /// The frequency's actions on what shows it, held or from VoiceOver;
    /// nothing where there is no figure.
    func frequencyActions(_ figure: String?) -> some View { modifier(FrequencyActions(figure: figure)) }
}
