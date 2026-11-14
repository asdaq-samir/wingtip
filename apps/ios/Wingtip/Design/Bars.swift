import SwiftUI

/// iOS 27's bars and controls (docs/ios-27.md has the sources), one helper
/// each, so a screen asks for the behaviour by name.
extension View {
    /// A long list's navigation bar folds away while it scrolls down and
    /// comes back on the way up (toolbarMinimizationBehavior): more of the
    /// nav log, the Brief or the logbook in sight at the sheet's height.
    /// Nothing moves; the bar and its buttons return the moment the pilot
    /// scrolls back.
    func navigationBarMinimizesOnScroll() -> some View {
        toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)
    }

    /// A picker that switches what a page shows (a card's Info, Weather,
    /// Runways and Charts) rather than setting a value: the tabs style,
    /// which looks as the segmented one does on iPhone but which VoiceOver
    /// reads as tabs.
    func tabsPicker() -> some View { pickerStyle(.tabs) }

    /// A text field in the system's border: the bordered style, drawn in
    /// the shape the system picks for the OS (textInputBorderShape).
    /// Height and type stay the system's, so the field follows Dynamic
    /// Type.
    func borderedField() -> some View { textFieldStyle(.bordered) }
}
