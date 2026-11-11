import SwiftUI
import UIKit

/// The plan's sheet's two pages, swiped between sideways (the owner's
/// carousel, 2026-11-11, docs/design/rules.md): Search, the one search
/// and its home list, and FPL, the flight plan. Always two, so the dots
/// do not change count; FPL with no route says "Plan a Flight".
enum PlanPage: Int, CaseIterable, Hashable {
    case search, fpl

    /// The page's name, as VoiceOver says it after "Page 1 of 2".
    var title: String {
        switch self {
        case .search: String(localized: "Search")
        case .fpl: Screen.fpl.title
        }
    }
}

/// The two pages in SwiftUI's own pager (TabView's page style), so the
/// swipe, its spring and its edge are the system's; its own dots are off,
/// since they sit at the foot and the sheet's go under the grabber
/// (PageDots). A sideways swipe moves the pages and never the sheet; an
/// up or down drag stays the sheet's, and each page's List keeps its own
/// scroll.
struct SheetPager<Search: View, Fpl: View>: View {
    @Binding var page: PlanPage
    @ViewBuilder let search: () -> Search
    @ViewBuilder let fpl: () -> Fpl

    var body: some View {
        TabView(selection: $page) {
            search().tag(PlanPage.search)
            fpl().tag(PlanPage.fpl)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .accessibilityIdentifier("sheet-pager")
    }
}

/// The page dots under the sheet's grabber: UIKit's own UIPageControl,
/// SwiftUI having no page control of its own in the iOS 27.2 SDK (only
/// TabView's dots, drawn at its foot). A tap on a dot or either side moves
/// the page, as the stock control does; VoiceOver hears "Page 1 of 2,
/// Search" and swipes up or down on it to turn the page.
struct PageDots: UIViewRepresentable {
    @Binding var page: PlanPage

    /// The row the dots take in the sheet: their 44-point tap area
    /// (WingtipSize.tapTarget) reaches past it into the grabber's strip
    /// above and the bar's margin below, so the control does not grow to
    /// get it (CLAUDE.md, hit areas).
    static let row: CGFloat = WingtipSize.tapTarget - WingtipSpace.sm * 2

    func makeUIView(context: Context) -> UIPageControl {
        let control = UIPageControl()
        control.numberOfPages = PlanPage.allCases.count
        control.hidesForSinglePage = false
        // The dots in the label's grey and the page's in the look's tint
        // (lookTint sets the window's tint), as the stock control is used
        // over a sheet's ground rather than its own white on a photo.
        control.pageIndicatorTintColor = .tertiaryLabel
        control.currentPageIndicatorTintColor = .tintColor
        control.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .valueChanged)
        control.accessibilityIdentifier = "sheet-page-dots"
        return control
    }

    func updateUIView(_ control: UIPageControl, context: Context) {
        context.coordinator.page = $page
        if control.currentPage != page.rawValue { control.currentPage = page.rawValue }
        control.accessibilityValue = String(localized: "Page \(page.rawValue + 1) of \(PlanPage.allCases.count), \(page.title)")
    }

    func makeCoordinator() -> Coordinator { Coordinator(page: $page) }

    @MainActor
    final class Coordinator: NSObject {
        var page: Binding<PlanPage>
        init(page: Binding<PlanPage>) { self.page = page }

        @objc func changed(_ control: UIPageControl) {
            guard let next = PlanPage(rawValue: control.currentPage) else { return }
            withAnimation { page.wrappedValue = next }
        }
    }
}
