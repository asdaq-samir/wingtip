import SwiftUI

/// A tap's area at least 44 × 44 points round a control that draws
/// smaller, centred on it, with the control itself left its stock size
/// (HIG Buttons; docs/design/ios.md, "Hit areas"). A fixed inset did not
/// reach it: the radio's glyph took 40 × 38 with ten points round it, and
/// the route box's small chips 28 to 30 points tall had none (the iOS
/// sheet audit, 2026-11-10).
struct HitArea: Shape {
    static let side: CGFloat = 44

    func path(in rect: CGRect) -> Path {
        Path(rect.insetBy(dx: min(0, (rect.width - Self.side) / 2), dy: min(0, (rect.height - Self.side) / 2)))
    }
}

extension View {
    /// The tap reaches 44 points round the control (HitArea), which keeps
    /// its own size.
    func hitArea() -> some View { contentShape(HitArea()) }
}
