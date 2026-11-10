import SwiftUI

/// The strip's timeline: the departure's card, each checkpoint a row --
/// its name, "MH 318 · 24 NM", the leg's minutes at the right -- a stop's
/// card, the destination's, on one magenta line, the middle folded where
/// there are more than six checkpoints; and after the destination the
/// way to the debrief. The points are the plan's own (StripData.points);
/// a checkpoint's row opens its leg in the nav log, a field's its card.
struct StripList: View {
    let points: [StripPoint]
    let onField: (String) -> Void
    let onPlates: (String) -> Void
    let onClearance: () -> Void
    let onLeg: (Leg) -> Void
    let onDebrief: () -> Void
    @Environment(\.chartInk) private var ink
    @State private var unfolded = false
    /// A checkpoint dot's paper casing, in points: its line's width, drawn outside the dot.
    private static let casing: CGFloat = 3

    var body: some View {
        if let first = points.first, let last = points.last, first.kind == .departure, points.count >= 2 {
            let middle = Array(points.dropFirst().dropLast())
            let fold = StripData.folded(middle, unfolded: unfolded)
            let numbers = StripData.numbers(middle)
            ZStack(alignment: .topLeading) {
                // The timeline's line: 4 points of magenta at the left,
                // each entry's dot on it.
                RoundedRectangle(cornerRadius: 2).fill(ink.magenta).frame(width: 4).padding(.leading, WingtipSpace.sm).padding(.vertical, WingtipSpace.md)
                VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                    StripFieldCard(point: first, atLabel: "leaving", clearance: true, plates: false,
                                   onOpen: onField, onPlates: onPlates, onClearance: onClearance)
                    ForEach(Array(fold.rows.enumerated()), id: \.offset) { _, row in
                        if let row {
                            if row.kind == .checkpoint {
                                checkpoint(row, number: numbers[row.key])
                            } else {
                                StripFieldCard(point: row, atLabel: "ETA", clearance: false, plates: false,
                                               onOpen: onField, onPlates: onPlates, onClearance: onClearance)
                            }
                        } else {
                            foldRow(fold.hidden)
                        }
                    }
                    if last.kind == .destination {
                        StripFieldCard(point: last, atLabel: "ETA", clearance: false, plates: true,
                                       onOpen: onField, onPlates: onPlates, onClearance: onClearance)
                    }
                    after
                }
            }
            .accessibilityIdentifier("strip-list")
        }
    }

    /// A checkpoint's row: its number and name, the leg's magnetic heading
    /// and distance under it (the nav log's figures), its minutes at the
    /// right; a tap opens the leg.
    private func checkpoint(_ point: StripPoint, number: Int?) -> some View {
        HStack(alignment: .top, spacing: WingtipSpace.md) {
            Circle().fill(ink.brown).frame(width: 14, height: 14)
                // The paper casing drawn outside the dot, as wide as its own line.
                .overlay(Circle().strokeBorder(ink.paper, lineWidth: Self.casing).padding(-Self.casing))
                .padding(.leading, WingtipSpace.xxs).padding(.top, WingtipSpace.lg)
            Button {
                if let leg = point.leg { onLeg(leg) }
            } label: {
                HStack(spacing: WingtipSpace.md) {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text("\(number.map { "\($0). " } ?? "")\(point.name)")
                            .font(ChartInk.text.weight(.medium)).lineLimit(1)
                        if let leg = point.leg {
                            Text("MH \(leg.magneticHeadingDeg.map(Format.heading) ?? Format.none) · \(Format.distance(leg.distanceNm))")
                                .font(ChartInk.note.monospacedDigit()).foregroundStyle(ink.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if let ete = point.leg?.eteMin {
                        Text(Format.duration(ete)).font(ChartInk.detail.monospacedDigit()).foregroundStyle(ink.muted)
                    }
                }
                .padding(.horizontal, WingtipSpace.xs).padding(.vertical, WingtipSpace.sm)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the leg in the nav log")
        }
    }

    /// "N more checkpoints", a tap unfolds them.
    private func foldRow(_ hidden: Int) -> some View {
        HStack(spacing: WingtipSpace.md) {
            Circle().fill(ink.paper).frame(width: 8, height: 8)
                .overlay(Circle().strokeBorder(ink.brown, lineWidth: 2))
                .padding(.leading, WingtipSpace.xs)
            Button("\(hidden) more checkpoints") { withAnimation(Motion.animation(.default)) { unfolded = true } }
                .font(ChartInk.text.weight(.semibold))
                .frame(minHeight: 44)
                .buttonStyle(.plain)
                .foregroundStyle(ink.tint)
        }
    }

    /// After the destination: the debrief, once a track is flown -- the
    /// saved flight's own page reads it (FlownTrackView's DebriefSections).
    private var after: some View {
        HStack(alignment: .top, spacing: WingtipSpace.md) {
            Circle().fill(ink.paper).frame(width: 14, height: 14)
                .overlay(Circle().strokeBorder(ink.magenta, lineWidth: 2))
                .padding(.leading, WingtipSpace.xxs).padding(.top, WingtipSpace.lg)
            Button(action: onDebrief) {
                HStack(spacing: WingtipSpace.md) {
                    Image(systemName: "flag.checkered").foregroundStyle(ink.tint).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text("Debrief").font(ChartInk.text.weight(.semibold))
                        Text("After the flight, from its saved track").font(ChartInk.note).foregroundStyle(ink.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").foregroundStyle(ink.tint).accessibilityHidden(true)
                }
                .padding(WingtipSpace.md)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .inkCard()
        }
    }
}

/// A field's card on the line: its ident and name, the time there, the
/// runway and wind, its chips -- ATIS, TOWER or CTAF, the clearance step
/// at the departure, PLATES at the destination. The ident is the way
/// into its card. The field's own card is fetched for the frequencies
/// and the weather (Planner.place), as the web's rows share airportQuery.
struct StripFieldCard: View {
    let point: StripPoint
    let atLabel: String
    let clearance: Bool
    let plates: Bool
    let onOpen: (String) -> Void
    let onPlates: (String) -> Void
    let onClearance: () -> Void
    @Environment(\.chartInk) private var ink
    @State private var place: AirportPlace?

    private var detail: String? {
        var parts: [String] = []
        if let runway = StripData.runwayInUse(place?.runways ?? []) { parts.append("Runway \(runway)") }
        if let weather = StripData.weatherLine(place?.metar) { parts.append(weather) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: WingtipSpace.md) {
            Circle().fill(ink.field).frame(width: 18, height: 18).padding(.top, WingtipSpace.lg)
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                HStack(alignment: .top, spacing: WingtipSpace.sm) {
                    Button { onOpen(point.name) } label: {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text(point.name).font(ChartInk.text.weight(.bold)).foregroundStyle(ink.tint)
                            if !point.longName.isEmpty {
                                Text(point.longName).font(ChartInk.detail).foregroundStyle(ink.muted).lineLimit(1)
                            }
                        }
                        .contentShape(Rectangle().inset(by: -8))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(point.name), \(point.longName)")
                    .accessibilityHint("Opens the field's card")
                    Spacer(minLength: 0)
                    if let minutes = point.minutesFlown {
                        VStack(alignment: .trailing, spacing: WingtipSpace.xxs) {
                            Text(Format.time(Date().addingTimeInterval(minutes * 60)))
                                .font(ChartInk.text.weight(.semibold).monospacedDigit())
                            Text(atLabel).font(ChartInk.note).foregroundStyle(ink.muted)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                if let detail {
                    Text(detail).font(ChartInk.detail).foregroundStyle(ink.ink.opacity(0.8))
                } else if let ground = point.leg?.groundMin, point.kind == .stop, ground > 0 {
                    Text("\(Format.duration(ground)) on the ground").font(ChartInk.detail).foregroundStyle(ink.ink.opacity(0.8))
                }
                chips
            }
            .padding(WingtipSpace.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .inkCard()
        }
        .task(id: point.name) {
            place = try? await Planner.place(point.name)
        }
    }

    @ViewBuilder
    private var chips: some View {
        let radio = place.map { StripData.radioChips($0.frequencies, towered: $0.towered) } ?? []
        if !radio.isEmpty || clearance || plates {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: WingtipSpace.sm) {
                    ForEach(radio, id: \.label) { chip in
                        Button(chip.label) { onOpen(point.name) }
                            .buttonStyle(.inkChip)
                            .accessibilityLabel(chip.words)
                            .frequencyActions(FrequencyCopy.figure(in: chip.words))
                    }
                    if clearance {
                        Button("Clearance", action: onClearance).buttonStyle(.inkChip).accessibilityLabel("The clearance card")
                    }
                    if plates {
                        Button("Plates") { onPlates(point.name) }.buttonStyle(.inkChip).accessibilityLabel("The approach plates")
                    }
                }
                .padding(.vertical, WingtipSpace.sm)
            }
        }
    }
}
