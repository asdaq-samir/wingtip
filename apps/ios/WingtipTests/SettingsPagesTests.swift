import Testing
@testable import Wingtip

/// You, Settings and the Map card (docs/design/rules.md §8): Settings is a
/// page pushed inside the card it was opened from, kept by a scene as the
/// other pages are; the Map card's chart pick reads the planner's base
/// layers in the web's order.
@MainActor
struct SettingsPagesTests {
    @Test func settingsIsAPageKeptByTheScene() {
        let page = SheetPage.settings(atMap: true)
        #expect(page.opensFull && !page.inspects)
        #expect(page.testID == "card-settings")
        #expect(page.stored == "+settings")
        #expect(SheetPage(stored: "+settings") == .settings(atMap: false))
    }

    @Test func theChartNamesAreTheWebs() {
        #expect(ChartPictures.name("sec", "Sectional Aeronautical Chart") == "Sectional")
        #expect(ChartPictures.name("ifr_low", "x") == "IFR Low")
        #expect(ChartPictures.name("ifr_high", "x") == "IFR High")
        #expect(ChartPictures.name("tac", "Terminal Area") == "Terminal Area")
    }
}
