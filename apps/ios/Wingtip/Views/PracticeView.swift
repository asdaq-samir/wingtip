import SwiftUI

/// The drills, each with the rule it comes from: the Guide's Practice,
/// and the same rows on their own page from Setup (2 taps from the map).
struct PracticeRows: View {
    var body: some View {
        ProblemLine(Drills.decks, "The drills' cards")
        NavigationLink { DrillView(deck: Drills.lightGun) } label: { row("Light gun signals", "14 CFR 91.125") }
        NavigationLink { DrillView(deck: Drills.vfrMinimums) } label: { row("VFR weather minimums", "14 CFR 91.155") }
        NavigationLink { LostCommsView() } label: { row("Lost communications", "14 CFR 91.185: route, altitude, and when to leave") }
        NavigationLink { HoldingView() } label: { row("Holding entries", "AIM 5-3-8: the entry, and the legs in the wind") }
    }

    private func row(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text(title)
            Text(detail).font(.footnote).foregroundStyle(.secondary)
        }
    }
}

/// The drills as a section of the Guide's and the Coach's, only while
/// Training Tools is on in Settings' Extras (Extra): parked, the flash
/// cards and calculators are what every study app has, and each cited
/// figure is one more to keep right (the feature review, 2026-11-21). The
/// diversion drill is Nearest's, not one of these, and not parked.
struct PracticeSection: View {
    @AppStorage(Extra.trainingTools.key) private var trainingTools = false

    var body: some View {
        if trainingTools { Section("Practice") { PracticeRows() } }
    }
}

/// Setup's Practice: the drills alone, on their own page; reached by its
/// link while Training Tools is off, where to turn them on.
struct PracticeView: View {
    @AppStorage(Extra.trainingTools.key) private var trainingTools = false

    var body: some View {
        List {
            if trainingTools {
                PracticeRows()
            } else {
                ContentUnavailableView("Training Tools Are Off", systemImage: "figure.walk.motion",
                                       description: Text("Turn them on in Settings, under Extras."))
            }
        }
        .navigationTitle("Practice")
    }
}

#Preview("PracticeView") {
    NavigationStack { PracticeView() }
}
