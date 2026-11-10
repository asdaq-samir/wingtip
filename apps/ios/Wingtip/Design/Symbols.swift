import SwiftUI

/// The app's glyphs move when what they stand for changes, as iOS's own
/// do (Apple's Human Interface Guidelines, SF Symbols: Animations): the
/// microphone breathes while it listens, a toggle's glyph is replaced by
/// its other face, the bell rings on a new alert, Direct To bounces when
/// taken, a figure rolls to its new value. One modifier each, so every
/// screen moves the same way; with Reduce Motion on, none of them moves
/// and the glyph or the figure shows its end state at once.
extension View {
    /// The glyph bounces once each time `value` changes: an action taken,
    /// as Direct To (Feel's count of it).
    func symbolBounce<V: Equatable>(on value: V) -> some View {
        modifier(SymbolOnce(value: value, ring: false))
    }

    /// The bell rings, a wiggle, each time `value` changes: a new alert.
    func symbolRing<V: Equatable>(on value: V) -> some View {
        modifier(SymbolOnce(value: value, ring: true))
    }

    /// The microphone while it listens: the glyph breathes, iOS 18's
    /// effect for something going on, as long as `active`.
    func symbolListening(_ active: Bool) -> some View {
        modifier(SymbolListening(active: active))
    }

    /// One glyph replaced by the other when a toggle flips (play and pause,
    /// a box ticked, a star kept): the system's magic replace, which turns
    /// the shared shape and draws the difference.
    func symbolSwap() -> some View { modifier(SymbolSwap()) }

    /// A figure that changes in place (ETE, fuel, distance, altitude)
    /// rolls its digits to the new value, as the system's timers and
    /// Weather do, rather than blinking.
    func figureTransition<V: Equatable>(_ value: V) -> some View {
        modifier(FigureTransition(value: value))
    }
}

private struct SymbolOnce<V: Equatable>: ViewModifier {
    let value: V
    let ring: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else if ring {
            content.symbolEffect(.wiggle, options: .nonRepeating, value: value)
        } else {
            content.symbolEffect(.bounce, options: .nonRepeating, value: value)
        }
    }
}

private struct SymbolListening: ViewModifier {
    let active: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.symbolEffect(.breathe, isActive: active && !reduceMotion)
    }
}

private struct SymbolSwap: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.contentTransition(reduceMotion ? .identity : .symbolEffect(.replace.magic(fallback: .downUp)))
    }
}

private struct FigureTransition<V: Equatable>: ViewModifier {
    let value: V

    func body(content: Content) -> some View {
        content
            .contentTransition(.numericText())
            .motion(.default, value: value)
    }
}
