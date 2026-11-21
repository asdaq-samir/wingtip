import SwiftUI

/// How the plan's sheet is presented on the iPhone (RootView): the
/// system's own sheet at the pill, half and full, with the map under it
/// usable up to half. Its own modifier, so the root holds the map and
/// the sheet's content alone.
struct PlanSheetPresentation: ViewModifier {
    @Binding var detent: PresentationDetent

    func body(content: Content) -> some View {
        content
            .environment(\.sheetAtPill, detent == RootView.pill)
            .presentationDetents([RootView.pill, .half, .large], selection: $detent)
            .presentationBackgroundInteraction(.enabled(upThrough: .half))
            // Solid at every detent, the look's own sheet ground, as the
            // web's sheet is: iOS 26's glass sheet at half took the yellow
            // chart under it, and the Nav Log's "No Legs Yet", You's Sign In
            // and the FPL's rows at the largest text fell under 4.5:1 there
            // (WCAG 2.2 1.4.3, the accessibility audit). Glass stays on what
            // floats over the map (docs/design/ios.md).
            .presentationBackground(WingtipInk.sheet)
            .interactiveDismissDisabled()
        // The system sheet settles at its detents with its own feel; no
        // tap of ours is added to a stock part (the owner, 2026-11-10).
    }
}
