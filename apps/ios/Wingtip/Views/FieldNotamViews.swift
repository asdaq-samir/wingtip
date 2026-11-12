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

/// Whether it is in force now: "Active" in red, "Inactive" in the
/// secondary grey, nothing to act on yet (the owner, 2026-11-11: "put a
/// active and inactive badge on each notam", "Inactive notam can be
/// disabled color"). In force unless the planner says it is not yet.
struct NotamStateBadge: View {
    let notam: APIRankedNotam

    var body: some View {
        let active = notam.inForce != false
        if active {
            StatusLabel("Active", systemImage: "exclamationmark.circle.fill", colour: WingtipInk.problem)
        } else {
            StatusLabel("Inactive", systemImage: "clock", colour: .secondary)
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

/// Its times, labelled, a line each (FieldNotamWords.timeLines), and where it is
/// only where that is not obvious.
struct NotamLinesView: View {
    let notams: FieldNotams
    let notam: APIRankedNotam

    var body: some View {
        let times = notams.times(notam)
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            // A line each, its label in the secondary ink before it, as
            // ForeFlight's list gives them; a line too long wraps whole.
            ForEach(times, id: \.label) { line in
                Text("\(Text(line.label).foregroundStyle(.secondary)) \(line.value)").monospacedDigit()
            }
            if let place = notams.place(notam) { Text(place).foregroundStyle(.secondary) }
        }
        .font(WingtipType.detail)
        .fixedSize(horizontal: false, vertical: true)
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
            if let problem = notams.problem {
                ProblemLine(problem)
            } else if let ranked = notams.ranked, ranked.notams.isEmpty {
                // Never "no NOTAMs": none heard since the feed's time (decision 0023).
                Text(ranked.coverageSince.map { "None heard since \($0)" } ?? "None heard").foregroundStyle(.secondary)
            } else if notams.ranked == nil {
                Text("A NOTAM's words and its times").loading("Fetching NOTAMs")
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
        } header: {
            header
        } footer: {
            if notams.ranked?.unchecked?.isEmpty == false {
                Text("The TFR list could not be read: check the FAA's TFRs before flying.").foregroundStyle(WingtipInk.caution)
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

/// One NOTAM in full, a page of the card's stack: its kind as the title and
/// its number under it ("NOTAM 11/439"), its badge and what, its times and
/// where, its words written out where the what says them shorter (both the
/// engine's, notam_read); a TFR's place, instructions and whom to call; and
/// its text as sent, folded, never rewritten.
struct FieldNotamPage: View {
    let notams: FieldNotams
    let notam: APIRankedNotam

    var body: some View {
        let number = "NOTAM \(FieldNotamWords.number(notam, ident: notams.ident))"
        let tfr = notam.kind == "tfr"
        List {
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                    NotamStateBadge(notam: notam)
                    NotamWhatText(what: notams.what(notam)).font(WingtipType.title)
                        .foregroundStyle(notam.inForce == false ? .secondary : .primary)
                    NotamLinesView(notams: notams, notam: notam)
                    if !tfr, let read = notams.reading(notam), read.what != nil {
                        Text(read.words).font(WingtipType.note).foregroundStyle(.secondary)
                    }
                }
            }
            if tfr { TfrDetailsSections(notam: notam, read: notams.tfr(notam)) }
            Section {
                DisclosureGroup(tfr ? "TFR as Sent" : "As Sent") {
                    Text(notam.raw).font(.footnote.monospaced()).textSelection(.enabled)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(notams.heading(notam))
        .navigationBarTitleDisplayMode(.inline)
        .navigationSubtitle(number)
        .toolbar {
            ToolbarItem(placement: .pinnedTrailing) {
                ShareLink(item: notam.raw) { Label("Share", systemImage: WingtipIcon.share) }
            }
        }
    }
}

/// A TFR's own sections under its lines: its place's name (tfr_read, its
/// dates off, as the time lines say them; the owner, 2026-11-12: "dates
/// are twice"), its instructions as the FAA gives them a line each in
/// sentence case with their codes kept (faa_words), and whom it names to
/// call, each telephone a link that dials.
struct TfrDetailsSections: View {
    let notam: APIRankedNotam
    let read: EngineContract.TfrReadAnswer?

    var body: some View {
        let t = notam.tfr
        if let place = read?.place { Section { Text(place) } }
        if let lines = t?.instructions, !lines.isEmpty {
            Section("Instructions") {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in Text(AirportWords.faaWords(line)) }
            }
        }
        if let facility = t?.facility { contact("Coordination Facility", facility) }
        if let contact = t?.contact { self.contact("Point of Contact", contact) }
    }

    private func contact(_ title: String, _ c: APITfrContact) -> some View {
        Section(title) {
            Text(c.name)
            if let phone = c.phone, let dial = URL(string: "tel:+1" + phone.filter(\.isNumber)) {
                Link(destination: dial) { Label(phone, systemImage: WingtipIcon.call).monospacedDigit() }
                    .accessibilityLabel("Call \(phone)")
            }
            if let frequency = c.frequency { LabeledContent("Frequency", value: frequency).monospacedDigit() }
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
