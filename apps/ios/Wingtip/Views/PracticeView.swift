import SwiftUI

/// The drills, each with the rule it comes from: the Guide's Practice,
/// and the same rows on their own page from Setup (2 taps from the map).
struct PracticeRows: View {
    var body: some View {
        ProblemLine(Drills.decks, "The drills' cards")
        NavigationLink { DrillView(deck: Drills.lightGun).closesBack() } label: { row("Light gun signals", "14 CFR 91.125") }
        NavigationLink { DrillView(deck: Drills.vfrMinimums).closesBack() } label: { row("VFR weather minimums", "14 CFR 91.155") }
        NavigationLink { LostCommsView().closesBack() } label: { row("Lost communications", "14 CFR 91.185: route, altitude, and when to leave") }
        NavigationLink { HoldingView().closesBack() } label: { row("Holding entries", "AIM 5-3-8: the entry, and the legs in the wind") }
    }

    private func row(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
            Text(detail).font(.footnote).foregroundStyle(.secondary)
        }
    }
}

/// Setup's Practice: the drills alone, on their own page.
struct PracticeView: View {
    var body: some View {
        List { PracticeRows() }
            .navigationTitle("Practice")
            .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("PracticeView") {
    NavigationStack { PracticeView() }
}
