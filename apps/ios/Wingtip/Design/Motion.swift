import SwiftUI
import UIKit

/// Movement on the screen with Reduce Motion honoured: a pilot who has it
/// on is spared things sliding and growing (Apple's Human Interface
/// Guidelines, Motion), and sees the end state at once. A fade is not
/// motion and stays.
enum Motion {
    /// `animation`, or none with Reduce Motion on: for withAnimation.
    @MainActor
    static func animation(_ animation: Animation) -> Animation? {
        UIAccessibility.isReduceMotionEnabled ? nil : animation
    }
}

extension View {
    /// .animation(_:value:) that steps to the end with Reduce Motion on.
    func motion<V: Equatable>(_ animation: Animation, value: V) -> some View {
        modifier(ReducedMotion(animation: animation, value: value))
    }
}

private struct ReducedMotion<V: Equatable>: ViewModifier {
    let animation: Animation
    let value: V
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}
