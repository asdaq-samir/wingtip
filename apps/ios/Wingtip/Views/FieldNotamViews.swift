import SwiftUI

/// The airport card's NOTAMs drawn (FieldNotams is their view model), as
/// the web's PlaceNotams, NotamBadge and TfrDetails: rows of four lines in
/// the Info tab, a page of each in the card's stack, and a badge on each
/// thing a NOTAM in force addresses.

/// A status word as a stock Label, its symbol and word in the status's
/// colour (docs/design/ios.md §17, status capsules: as Weather states a
/// condition), in place of a hand-drawn capsule: Active and Inactive on a
/// NOTAM, a NOTAM's mark on what it addresses, a runway's Best Wind.
struct StatusLabel: View {
    let words: String
    let symbol: String
    let colour: Color

    init(_ words: String, systemImage symbol: String, colour: Color) {
        self.words = words
        self.symbol = symbol
        self.colour = colour
    }

    var body: some View {
        Label(words, systemImage: symbol)
            .font(WingtipType.label)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(colour)
    }
}

/// Whether it is in force now, the shared badge (the owner, 2026-11-11:
/// "put a active and inactive badge on each notam"; 2026-11-14: "Use
/// badges where we can"; the web's PlaceNotams NotamState): Active; Later
/// where it starts later; and Inactive, the owner's word, in the cold fill
/// where it is out of force otherwise. In force unless the planner says it
/// is not (in_force false).
struct NotamStateBadge: View {
    let notam: APIRankedNotam

    var body: some View {
        TimelineView(.everyMinute) { context in
            let active = notam.inForce != false
            let starts = notam.starts.flatMap { try? Date($0, strategy: .iso8601) }
            let later = !active && (starts.map { $0 > context.date } ?? false)
            StatusBadge(active ? .active : later ? .later : .cold, words: active || later ? nil : "Inactive")
        }
    }
}

/// A NOTAM's badge by the thing it addresses: the engine's word in red where
/// the thing is closed or not to be used, in the caution's colour where it
/// is still open (the owner, 2026-11-11: "If runway is not closed, the notam
/// badge can be caution color"). VoiceOver reads the NOTAM's words.
struct NotamMarkBadge: View {
    let mark: NotamMark

    var body: some View {
        StatusLabel(mark.word, systemImage: mark.unusable ? "xmark.octagon.fill" : "exclamationmark.triangle.fill",
                    colour: mark.unusable ? WingtipInk.problem : WingtipInk.caution)
            .accessibilityLabel("\(mark.word): \(mark.label)")
    }
}

/// Its first line, "closed" and "out of service" in red where they are in
/// it and nothing else of it (the owner, 2026-11-11: "just the word closed
/// and 'out of service' should be red and nothing else of the wording").
struct NotamWhatText: View {
    let what: String

    static func marked(_ what: String) -> AttributedString {
        var out = AttributedString()
        var rest = what[...]
        while let hit = rest.firstMatch(of: /\b(closed|out of service)\b/.ignoresCase()) {
            out += AttributedString(String(rest[..<hit.range.lowerBound]))
            var red = AttributedString(String(rest[hit.range]))
            red.foregroundColor = WingtipInk.problem
            out += red
            rest = rest[hit.range.upperBound...]
        }
        return out + AttributedString(String(rest))
    }

    var body: some View { Text(Self.marked(what)) }
}

/// A NOTAM's times (FieldNotamWords.timeLines), labelled, one line each and
/// never wrapped, on its row and on its own card (the owner, 2026-11-23:
/// "one line each", at 390 pt and the owner's larger text): where how long
/// until it ("· in 551d") would not fit beside the time, the line drops
/// it, so the time stays whole (the web's NotamTimeLines).
struct NotamTimeLinesView: View {
    let lines: [FieldNotamWords.TimeLine]

    var body: some View {
        if !lines.isEmpty { column }
    }

    private var column: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            ForEach(lines, id: \.label) { line in
                ViewThatFits(in: .horizontal) {
                    if let soon = line.soon { text(line, "\(line.value) · \(soon)") }
                    text(line, line.value)
                }
            }
        }
        .monospacedDigit()
        .accessibilityIdentifier("place-notam-when")
    }

    /// Its label in the secondary ink before it, as ForeFlight's list gives them.
    private func text(_ line: FieldNotamWords.TimeLine, _ value: String) -> some View {
        Text("\(Text(line.label).foregroundStyle(.secondary)) \(value)").lineLimit(1)
    }
}

/// Its times, a line each (NotamTimeLinesView), and where it is only where
/// that is not obvious.
struct NotamLinesView: View {
    let notams: FieldNotams
    let notam: APIRankedNotam

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            // On the minute, so "in 18d" moves on as Android's rows do.
            TimelineView(.everyMinute) { context in NotamTimeLinesView(lines: notams.times(notam, now: context.date)) }
            if let place = notams.place(notam) {
                Text(place).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(WingtipType.detail)
    }
}

/// One NOTAM's row: its Active or Inactive badge where a row's symbol is,
/// its what the line's whole width, its times and where under it (the
/// owner, 2026-11-11: "title(what), when, where ... on different lines").
/// Its number is on its own page only.
struct FieldNotamRow: View {
    let notams: FieldNotams
    let notam: APIRankedNotam

    var body: some View {
        let inactive = notam.inForce == false
        HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.md) {
            NotamStateBadge(notam: notam)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                NotamWhatText(what: notams.what(notam))
                    .lineLimit(notam.kind != "tfr" && notams.reading(notam)?.what == nil ? 3 : nil)
                    .fixedSize(horizontal: false, vertical: true)
                NotamLinesView(notams: notams, notam: notam)
            }
            .foregroundStyle(inactive ? .secondary : .primary)
        }
        .appEntityIdentifier(SiriSaw.notam(notam.id))
        .accessibilityElement(children: .combine)
    }
}

/// The field's NOTAMs in its card's Info tab: the engine's first three,
/// "3 of 9" at the title's right, and under them the stock DisclosureGroup
/// that opens every one in place under its kind and closes them again,
/// back to the three (the owner, 2026-11-11: "Can notams also show as a
/// list of three like others", "Notams should open like other sections").
/// A row opens the NOTAM in full.
struct FieldNotamsSection: View {
    @Environment(FieldNotams.self) private var notams

    var body: some View {
        @Bindable var notams = notams
        Section {
            // The NOTAMs kept for the air, shown with no signal, with their
            // age, amber past kept_age's hour (AIM 5-1-3), as the route's.
            if !notams.ident.isEmpty, notams.ranked != nil {
                KeptAgeLine(kind: .notams, key: KeptForAir.fieldNotamsKey(notams.ident))
            }
            if let problem = notams.problem {
                ProblemLine(problem)
            } else if let ranked = notams.ranked, ranked.notams.isEmpty {
                // Never "no NOTAMs": none heard since the feed's time (decision
                // 0059, NotamCoverage), or for a private field none issued
                // (airport_notams_none).
                switch notams.outsideNotams {
                case .success(let outside?): Text(outside).foregroundStyle(.secondary)
                case .success(nil):
                    Text(NotamCoverage.none(since: ranked.coverageSince, full: ranked.fullSet ?? false)).foregroundStyle(.secondary)
                case let failed: ProblemLine(failed, "Whether this field has NOTAMs")
                }
            } else if notams.ranked == nil {
                Text("A NOTAM's words and its times").loading(Wording.fetchingNotams)
            }
            if !(notams.all && notams.long) { rows(notams.shown) }
            if notams.long {
                DisclosureGroup(isExpanded: $notams.all) {
                    ForEach(notams.kinds(notams.shown), id: \.kind) { group in
                        Text(group.kind).font(WingtipType.note).foregroundStyle(.secondary)
                            .accessibilityAddTraits(.isHeader)
                        rows(group.notams)
                    }
                } label: {
                    Text("All \(notams.notams.count) NOTAMs")
                }
            }
            // Only what the feed has sent since its day, not the full set
            // (decision 0059), as the web's card says under its list; not
            // for a field outside the NOTAM system.
            if let ranked = notams.ranked, ranked.fullSet != true, case .success(nil) = notams.outsideNotams {
                Text(NotamCoverage.line(since: ranked.coverageSince, full: false))
                    .font(WingtipType.note).foregroundStyle(WingtipInk.caution)
                    .accessibilityIdentifier("place-notams-coverage")
            }
        } header: {
            header
        } footer: {
            if notams.ranked?.unchecked?.isEmpty == false {
                Text(Wording.tfrListNotRead).foregroundStyle(WingtipInk.caution)
            }
        }
    }

    private func rows(_ list: [APIRankedNotam]) -> some View {
        ForEach(list, id: \.id) { notam in
            NavigationLink { FieldNotamPage(notams: notams, notam: notam) } label: { FieldNotamRow(notams: notams, notam: notam) }
        }
    }

    private var header: some View {
        HStack {
            Text("NOTAMs")
                .accessibilityValue(notams.long ? (notams.all ? "All shown" : "\(notams.shown.count) of \(notams.notams.count) shown") : "")
            Spacer()
            if notams.long && !notams.all {
                Text("\(notams.shown.count) of \(notams.notams.count)").monospacedDigit().accessibilityHidden(true)
            }
        }
    }
}

/// The NOTAMs on one thing, from a tap on its badge or its row: one in
/// full, several as the list's rows, each opening in full.
struct NotamsOnPage: View {
    let notams: FieldNotams
    let open: OpenNotams

    var body: some View {
        let list = notams.notams(open)
        if list.count == 1, let one = list.first {
            FieldNotamPage(notams: notams, notam: one)
        } else {
            List {
                ForEach(list, id: \.id) { notam in
                    NavigationLink { FieldNotamPage(notams: notams, notam: notam) } label: { FieldNotamRow(notams: notams, notam: notam) }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("NOTAMs")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// A row a NOTAM addresses: with a mark, a link to the NOTAM(s) on it with
/// the mark's badge in the row; without, the row as it is.
struct NotamMarked<Row: View>: View {
    let notams: FieldNotams
    let mark: NotamMark?
    @ViewBuilder var row: () -> Row

    var body: some View {
        if let mark {
            NavigationLink { NotamsOnPage(notams: notams, open: mark.open) } label: { row() }
                .accessibilityHint("Opens its NOTAM")
        } else {
            row()
        }
    }
}
