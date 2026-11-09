import SwiftUI

/// The field's D-ATIS on the card's Weather tab, where the tower's data
/// link sends one (wingtip.datis, STDDS's TDES): each broadcast, arrival
/// and departure apart, read by the engine into the figures a heard ATIS
/// is (read_datis), its words as sent folded under them. Nothing where
/// the field has none.
struct DigitalAtisSections: View {
    @Environment(AirportLive.self) private var live

    var body: some View {
        ForEach(live.broadcasts) { b in
            Section(title: b.title) {
                if let reading = b.reading, reading.heardAny {
                    CardRow(badge: RowBadge(systemImage: "dot.radiowaves.left.and.right", colour: Badge.weather), title: reading.glance)
                    ForEach(Array(reading.rows.enumerated()), id: \.offset) { _, row in
                        LabeledContent(row.label, value: row.value)
                    }
                }
                DisclosureGroup("As Sent") {
                    Text(b.text).font(.footnote.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                }
                // The source, a credit.
                Text("FAA D-ATIS").font(WingtipType.note).foregroundStyle(.secondary)
            }
        }
    }
}

/// The field's runway visual range on the Runways tab, where its RVR
/// system reports on SWIM (wingtip.rvr): each runway end's touchdown,
/// midpoint and rollout in feet, and one under the pilot's own visibility
/// minimum said so by the engine (rvr_check, 14 CFR 91.175(h)(2)).
struct RvrSection: View {
    @Environment(AirportLive.self) private var live

    var body: some View {
        if !live.rvr.isEmpty || live.problem != nil {
            Section(title: "Runway Visual Range, ft") {
                ForEach(live.rvr) { row in
                    CardRow(badge: RowBadge(systemImage: "eye", colour: Badge.runway), title: "RVR \(row.runway)",
                            detail: row.under ?? "Touchdown · midpoint · rollout") {
                        Text(row.readings).fontWeight(.semibold).monospacedDigit()
                    }
                    .foregroundStyle(row.under != nil ? WingtipInk.problem : Color.primary)
                }
                ProblemLine(live.problem)
                Text("FAA RVR, through SWIM").font(WingtipType.note).foregroundStyle(.secondary)
            }
        }
    }
}

/// The Command Center's ground stops and delay programs at the field
/// (wingtip.flow), on the Info tab, first, where there is one.
struct FlowProgramsSection: View {
    @Environment(AirportLive.self) private var live

    var body: some View {
        if !live.programs.isEmpty {
            Section(title: "Traffic Management") {
                ForEach(live.programs, id: \.self) { line in
                    CardRow(badge: RowBadge(systemImage: "hourglass", colour: Badge.traffic), title: line)
                }
                Text("FAA ATCSCC").font(WingtipType.note).foregroundStyle(.secondary)
            }
        }
    }
}

#Preview("Live sections") {
    List {
        FlowProgramsSection()
        DigitalAtisSections()
        RvrSection()
    }
    .environment(AirportLive())
}
