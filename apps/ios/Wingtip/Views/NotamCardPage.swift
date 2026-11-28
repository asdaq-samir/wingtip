import SwiftUI

/// One NOTAM in full, a page of the card's stack, as the web's NotamCard
/// (the owner, 2026-11-23, of FDC 6/3373): titled what happened (the
/// engine's notam_card, "Runway 18/36 closed"), else what kind it is
/// (notam_read's heading); the field and its number under it ("KARR Aurora
/// Municipal · FDC 6/3373"); its category as a small label; chips, Active
/// or not, Permanent and that it affects the planned flight; one plain
/// sentence of its effect; the procedures it takes away; its times in
/// words; and its text as sent, folded, never rewritten. Each the
/// engine's; where it cannot structure one, the NOTAM's words written out
/// (notam_read) stand in, as before. A TFR's place, instructions and whom
/// to call are TfrDetailsSections'.
struct FieldNotamPage: View {
    @Environment(Plan.self) private var plan
    let notams: FieldNotams
    let notam: APIRankedNotam

    var body: some View {
        let tfr = notam.kind == "tfr"
        let card = notams.card(notam)
        List {
            Section {
                if let card {
                    NotamCardBody(notams: notams, notam: notam, card: card, role: role)
                } else {
                    plain(tfr: tfr)
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
        .navigationTitle(card?.title ?? notams.heading(notam))
        .navigationBarTitleDisplayMode(.inline)
        .navigationSubtitle(subtitle(card))
        .accessibilityIdentifier("place-notam-card")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ShareLink(item: notam.raw) { Label("Share", systemImage: WingtipIcon.share) }
            }
        }
    }

    /// The page as it was before the engine read a card: its badge and
    /// what, its times and where, its words where the what says them
    /// shorter (notam_read); a TFR always.
    private func plain(tfr: Bool) -> some View {
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

    /// The field and its number: an FDC NOTAM's with its accountability
    /// ("FDC 6/3373", JO 7930.2 4-2-1), the field's own without the field's
    /// name ("NOTAM 11/060").
    private func subtitle(_ card: EngineContract.NotamCardAnswer?) -> String {
        let number = card?.account == "FDC" ? notams.reading(notam)?.number.map { "FDC \($0)" } : nil
        let line = number ?? "NOTAM \(FieldNotamWords.number(notam, idents: notams.idents))"
        guard !notams.ident.isEmpty else { return line }
        let field = notams.fieldName.map { "\(notams.ident) \($0)" } ?? notams.ident
        return "\(field) · \(line)"
    }

    /// What the NOTAM's field is to the planned flight, as the chip says
    /// it: the engine's (notam_affects, through the field's model), the
    /// words this app's.
    private var role: PlanRole? {
        notams.affects(notam, dep: plan.dep, stops: plan.stops, dest: plan.dest, alternate: plan.extras.alternate)
            .flatMap { chip in PlanRole.words[chip.role].map { PlanRole(words: $0, taken: chip.taken) } }
    }
}

/// The chip's words, and whether it takes away a procedure the role
/// flies (red) or is only the field's (neutral).
private struct PlanRole {
    let words: String
    let taken: Bool

    /// The chip's words for each role the engine names.
    static let words = ["departure": "Affects your departure", "stop": "Affects your stop",
                        "arrival": "Affects your arrival", "alternate": "Affects your alternate"]
}

/// The card the engine read (notam_card), drawn as the web's NotamFull.
private struct NotamCardBody: View {
    let notams: FieldNotams
    let notam: APIRankedNotam
    let card: EngineContract.NotamCardAnswer
    let role: PlanRole?

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            // The category is a label only where the title says what
            // happened; otherwise it is the title already.
            if card.title != nil, let category = card.category {
                Text(category).font(WingtipType.note).foregroundStyle(.secondary)
                    .accessibilityIdentifier("place-notam-category")
            }
            chips
            Text(card.effect ?? notams.reading(notam)?.words ?? notam.raw)
                .font(WingtipType.prose)
                .foregroundStyle(notam.inForce == false ? .secondary : .primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("place-notam-effect")
            if !card.procedures.isEmpty { notAuthorized }
            // On the minute, so "in 18d" moves on as Android's do.
            TimelineView(.everyMinute) { context in
                NotamTimeLinesView(lines: notams.times(notam, now: context.date)).font(WingtipType.prose)
            }
            if let place = notams.place(notam) {
                Text(place).font(WingtipType.prose).foregroundStyle(.secondary)
            }
        }
    }

    /// Active or not, Permanent, and that it affects the planned flight,
    /// wrapping as the web's chips do on a narrow column.
    private var chips: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: WingtipSpace.sm) { chipList }
            VStack(alignment: .leading, spacing: WingtipSpace.xs) { chipList }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var chipList: some View {
        NotamStateBadge(notam: notam)
        if card.permanent {
            StatusLabel("Permanent", systemImage: "pin.fill", colour: .secondary)
        }
        if let role {
            StatusLabel(role.words, systemImage: "exclamationmark.triangle.fill", colour: role.taken ? WingtipInk.problem : .secondary)
                .accessibilityIdentifier("place-notam-affects")
        }
    }

    /// The procedures it takes away, by their charted names in capitals and
    /// their numbers ("ADELL 8 · BLOKR 8 (RNAV)"; the owner, 2026-11-23),
    /// RNAV said once where every one is.
    private var notAuthorized: some View {
        let all = card.procedures.allSatisfy(\.rnav)
        let names = card.procedures.map { $0.rnav && !all ? "\($0.name) (RNAV)" : $0.name }.joined(separator: " · ")
        return VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text("Not authorized").font(WingtipType.note).foregroundStyle(.secondary)
            Text(names + (all ? " (RNAV)" : "")).font(WingtipType.prose)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("place-notam-not-authorized")
    }
}
