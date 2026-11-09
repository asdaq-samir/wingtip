import SwiftUI

/// The rows a list or a card will hold, drawn as soft bars while they
/// load, in place of a spinner: the app's one skeleton. The bars are the
/// theme's grey (WingtipInk.skeleton) and breathe once a
/// motion.skeleton-pulse; with Reduce Motion on they hold still.
/// VoiceOver reads the one label, "Loading", or the caller's.
struct Skeleton: View {
    var rows = 3
    var label = "Loading"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            ForEach(0..<rows, id: \.self) { row in
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    bar(width: 0.45, height: 14)
                    // Each row's second line a little shorter than the last.
                    bar(width: 0.9 - 0.12 * Double(row % 3), height: 10)
                }
            }
        }
        .padding(.vertical, WingtipSpace.xs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(dim ? 0.45 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: WingtipMotion.skeletonPulse / 2).repeatForever(autoreverses: true)) { dim = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private func bar(width: Double, height: CGFloat) -> some View {
        GeometryReader { box in
            RoundedRectangle(cornerRadius: height / 2)
                .fill(WingtipInk.skeleton)
                .frame(width: box.size.width * width, height: height)
        }
        .frame(height: height)
    }
}

#Preview("Skeleton") {
    List {
        Skeleton()
        Section { Skeleton(rows: 1) }
    }
}
