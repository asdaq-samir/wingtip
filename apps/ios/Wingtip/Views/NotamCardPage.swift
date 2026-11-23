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
    /// it (the web's usePlanRole): the departure, a stop, the destination or
    /// the alternate filed, only for a NOTAM in force. A procedure taken
    /// away affects only the role that flies it: a SID or an ODP the
    /// departure and each stop left from, a STAR the destination, each stop
    /// and the alternate (AIM 5-2-9, 5-4-1; the engine's notam_card says
    /// which each is). `taken` is whether it takes away one the role flies,
    /// the red chip; a NOTAM taking none (a runway closed, a light out) is
    /// the field's, the neutral chip.
    private var role: PlanRole? {
        guard notam.inForce != false else { return nil }
        let idents = notams.idents.map { $0.uppercased() }
        func its(_ field: String?) -> Bool {
            guard let field, !field.isEmpty else { return false }
            return idents.contains(field.uppercased())
        }
        // Each role, in the order the chip names them, and whether it
        // leaves from the field (a departure procedure's) or lands there.
        let all: [(words: String, here: Bool, leaves: Bool, lands: Bool)] = [
            ("Affects your departure", its(plan.dep), true, false),
            ("Affects your stop", plan.stops.contains { its($0) }, true, true),
            ("Affects your arrival", its(plan.dest), false, true),
            ("Affects your alternate", its(plan.extras.alternate), false, true),
        ]
        let roles = all.filter { $0.here }
        guard let procedures = notams.card(notam)?.procedures, !procedures.isEmpty else {
            return roles.first.map { PlanRole(words: $0.words, taken: false) }
        }
        let flown = roles.first { r in procedures.contains { $0.departure ? r.leaves : r.lands } }
        return flown.map { PlanRole(words: $0.words, taken: true) }
    }
}

/// The chip's words, and whether it takes away a procedure the role
/// flies (red) or is only the field's (neutral).
private struct PlanRole {
    let words: String
    let taken: Bool
}

/// The card the engine read (notam_card), drawn as the web's NotamFull.
private struct NotamCardBody: View {
    let notams: FieldNotams
    let notam: APIRankedNotam
    let card: EngineContract.NotamCardAnswer
    let role: PlanRole?

    var body: some View {
        let times = notams.times(notam)
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
            NotamTimeLinesView(lines: times).font(WingtipType.prose)
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
