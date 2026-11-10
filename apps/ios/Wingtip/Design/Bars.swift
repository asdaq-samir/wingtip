import SwiftUI

/// iOS 27's bars and controls, each behind its availability with what the
/// app drew before as the fallback (docs/ios-27.md has the sources). One
/// helper each, so a screen asks for the behaviour and the OS version is
/// decided here once.
extension ToolbarItemPlacement {
    /// The trailing end of the navigation bar, pinned there on iOS 27
    /// (topBarPinnedTrailing): a pinned item stays in the bar when the
    /// window narrows (iPhone apps resize on iOS 27, in iPhone Mirroring
    /// and on iPad) rather than going to the overflow menu, as Apple's own
    /// example keeps Share. The same place on the screen as before.
    static var pinnedTrailing: ToolbarItemPlacement {
        if #available(iOS 27.0, *) { .topBarPinnedTrailing } else { .topBarTrailing }
    }
}

extension View {
    /// A long list's navigation bar folds away while it scrolls down and
    /// comes back on the way up (iOS 27's toolbarMinimizationBehavior),
    /// as the tab bar under it already does on iOS 26
    /// (tabBarMinimizesOnScroll): more of the nav log, the Brief or the
    /// logbook in sight at the sheet's height. Nothing moves; the bar and
    /// its buttons return the moment the pilot scrolls back. Before iOS 27
    /// the bar stays as it is.
    @ViewBuilder
    func navigationBarMinimizesOnScroll() -> some View {
        if #available(iOS 27.0, *) {
            toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)
        } else {
            self
        }
    }

    /// A picker that switches what a page shows (a card's Info, Weather,
    /// Runways and Charts) rather than setting a value: iOS 27's tabs style,
    /// which looks as the segmented one does on iPhone but which VoiceOver
    /// reads as tabs. The segmented control before it.
    @ViewBuilder
    func tabsPicker() -> some View {
        if #available(iOS 27.0, *) {
            pickerStyle(.tabs)
        } else {
            pickerStyle(.segmented)
        }
    }

    /// A text field in the system's border: iOS 27's bordered style, drawn
    /// in the shape the system picks for the OS (textInputBorderShape), the
    /// rounded border before it. Height and type stay the system's, so the
    /// field follows Dynamic Type as it did.
    @ViewBuilder
    func borderedField() -> some View {
        if #available(iOS 27.0, *) {
            textFieldStyle(.bordered)
        } else {
            textFieldStyle(.roundedBorder)
        }
    }
}
