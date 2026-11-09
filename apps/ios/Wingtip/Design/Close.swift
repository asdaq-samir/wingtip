import SwiftUI
import UIKit

/// The one way back: every level -- a page pushed in a tab, a card, a
/// sheet -- has its title on top and this close at the right, which goes
/// back one level (docs/decisions/0015: no Back buttons). The UI audit of
/// 2026-11-09 (item 7) found five styles on the iPhone: the system's Back
/// chevron, two X glyphs, Close, Done and Cancel. Cancel stays only where
/// it throws away an edit.
///
/// On iOS 26 the system's own close (Button(role: .close)), drawn as
/// Liquid Glass in the bar; on iOS 18 the same glyph, named for VoiceOver.
struct CloseButton: View {
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            Button(role: .close, action: action)
        } else {
            Button(action: action) { Image(systemName: "xmark") }
                .accessibilityLabel("Close")
        }
    }
}

extension View {
    /// The close at the right of this level's bar, doing `action`.
    func closeButton(_ action: @escaping () -> Void) -> some View {
        toolbar {
            ToolbarItem(placement: .topBarTrailing) { CloseButton(action: action) }
        }
    }

    /// A page pushed in a stack: its title inline on top, the close at the
    /// right going back one level, and no Back chevron. The swipe from the
    /// edge still goes back (BackSwipe below).
    func closesBack() -> some View { modifier(ClosesBack()) }
}

private struct ClosesBack: ViewModifier {
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .closeButton { dismiss() }
    }
}

/// The edge swipe back kept with the Back chevron hidden: UIKit turns its
/// pop gesture off with the back button, which lost the swipe in the strip
/// layout (the UI audit, 2026-11-09). The gesture is let begin whenever
/// there is a level to go back to, as it does with the chevron shown.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        gestureRecognizer == interactivePopGestureRecognizer ? viewControllers.count > 1 : true
    }
}
