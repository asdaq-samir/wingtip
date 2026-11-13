import SwiftUI

/// The last watch that went off, over the map until it is put away.
struct WatchBanner: View {
    @Environment(Tracking.self) private var tracking
    var body: some View {
        if let words = tracking.fired {
            HStack(spacing: WingtipSpace.sm) {
                Image(systemName: "bell.fill").symbolRing(on: words).accessibilityHidden(true)
                Text(words).font(.subheadline.weight(.semibold)).lineLimit(2)
                Button { tracking.fired = nil } label: {
                    // The 44-point hit area round the glyph, which does not grow.
                    Image(systemName: "xmark").contentShape(Rectangle().inset(by: -12))
                }
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
            .floatingGlass(in: Capsule())
        } else if let problem = tracking.watchProblem {
            // A watch that could not be checked says so where it would
            // have gone off, rather than staying quiet.
            Label(problem, systemImage: "exclamationmark.triangle")
                .font(.subheadline).foregroundStyle(WingtipInk.caution).lineLimit(2)
                .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
                .floatingGlass(in: Capsule())
        }
    }
}
