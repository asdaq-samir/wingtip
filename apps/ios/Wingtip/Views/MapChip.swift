import SwiftUI

/// A small line of words in glass over the map's corner: the traffic's
/// credit, why its heights are missing, the receiver heard. One look for
/// all of them.
struct MapChip: View {
    let text: String
    var systemImage: String?
    var colour: Color?

    init(_ text: String, systemImage: String? = nil, colour: Color? = nil) {
        self.text = text
        self.systemImage = systemImage
        self.colour = colour
    }

    var body: some View {
        Group {
            if let systemImage {
                Label(text, systemImage: systemImage)
            } else {
                Text(text)
            }
        }
        .font(.caption2)
        .foregroundStyle(colour ?? .primary)
        .padding(.horizontal, WingtipSpace.sm).padding(.vertical, WingtipSpace.xxs)
        .floatingGlass(in: Capsule())
    }
}
