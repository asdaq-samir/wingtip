import SwiftUI
import UIKit

/// Whether a view's window is the key one: the one window of all the
/// app's (two maps side by side, Stage Manager's) that takes the keyboard
/// and the menu bar's commands, which UIKit makes of the window the pilot
/// last touched. SwiftUI's `appearsActive` is true of every window in the
/// foreground, so ⌘F and the route's undo steps ask this instead.
@MainActor
final class KeyWindow {
    fileprivate weak var view: UIView?

    var isKey: Bool { view?.window?.isKeyWindow == true }
}

/// The probe a view puts behind itself (`keyWindow(_:)`): an empty UIKit
/// view whose window the KeyWindow reads.
private struct KeyWindowProbe: UIViewRepresentable {
    let window: KeyWindow

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        window.view = view
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {}
}

extension View {
    /// Tells `window` which window this view is in, and runs `became` each
    /// time that window becomes the key one.
    func keyWindow(_ window: KeyWindow, became: @escaping () -> Void = {}) -> some View {
        background(KeyWindowProbe(window: window))
            .onReceive(NotificationCenter.default.publisher(for: UIWindow.didBecomeKeyNotification)) { _ in
                if window.isKey { became() }
            }
    }
}
