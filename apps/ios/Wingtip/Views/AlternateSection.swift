import SwiftUI

/// Under IFR, the alternate, as the web's Brief has it (AlternateSection):
/// whether the destination needs one -- the "1-2-3" of 14 CFR 91.169(b),
/// an approach and its TAF an hour either side of the ETA -- the one
/// filed, checked at the ETA there against its alternate minimums
/// (91.169(c)), and the nearest fields with a TAF that will do, each filed
/// with a tap. Every judgment is the engine's through the planner
/// (AlternateCheck), its reasons shown in its words; the fuel on to the
/// one filed is the nav log's (91.167(a)(2)). In the Brief and on its
/// own page from the plan's Alternate row.
struct AlternateSection: View {
    @Environment(Plan.self) private var plan
    @Environment(AlternateCheck.self) private var check
    /// The Airplane page, where the wait is for one.
    var pickAirplane: (() -> Void)?

    var body: some View {
        if let waiting = check.waiting {
            Section("Alternate") {
                Text(waiting).foregroundStyle(.secondary)
                if check.needsAirplane, let pickAirplane {
                    Button(action: pickAirplane) { Label("Pick an Airplane", systemImage: WingtipIcon.airplane) }
                }
            }
        } else if let problem = check.problem {
            Section("Alternate") { ProblemLine(problem) }
        } else if let answer = check.answer {
            destination(answer.destination)
            if let filed = answer.alternate { self.filed(filed) }
            suggestions(answer.suggestions ?? [], filed: answer.alternate?.ident)
        } else if check.asking {
            Section("Alternate") {
                Text("Fetching the destination's forecast…").foregroundStyle(.secondary)
                    .loading("Fetching the destination's forecast")
            }
        }
    }

    private func destination(_ d: APIDestinationCheck) -> some View {
        Section("Alternate · Destination") {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                HStack {
                    Label(d.required ? "An alternate is required" : "No alternate required",
                          systemImage: d.required ? "exclamationmark.triangle.fill" : "checkmark.circle")
                        .foregroundStyle(d.required ? WingtipInk.caution : .primary)
                    Spacer(minLength: 0)
                    Text(Self.ceilingAndVisibility(d.ceilingFt, d.visibilitySm)).monospacedDigit().foregroundStyle(.secondary)
                }
                // The engine's reasons as it gives them: a TAF that does not
                // cover the arrival window, no approach, the 1-2-3 missed.
                let reasons = d.reasons ?? []
                Text(reasons.isEmpty ? "An approach, and 2,000 ft and 3 SM an hour either side of the ETA (14 CFR 91.169(b))." : reasons.joined(separator: " "))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Text(d.taf ?? "No TAF for the destination").font(d.taf == nil ? .footnote : .footnote.monospaced()).foregroundStyle(.secondary)
        }
    }

    private func filed(_ a: APIAlternateCheck) -> some View {
        Section("Alternate · Filed") {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                HStack {
                    Text(a.ident).font(.headline.monospaced())
                    Spacer(minLength: 0)
                    Text(Self.standing(a)).font(.subheadline.weight(a.good == false ? .semibold : .regular))
                        .foregroundStyle(a.good == false ? WingtipInk.problem : a.good == nil ? WingtipInk.caution : .secondary)
                }
                Text(Self.description(a)).font(.footnote).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            if let taf = a.taf { Text(taf).font(.footnote.monospaced()).foregroundStyle(.secondary) }
            if let page = a.alternateMinimumsUrl.flatMap(URL.init(string:)) {
                Link(destination: page) { Label("Its Alternate Minimums", systemImage: "doc.text") }
            }
            Button(role: .destructive) { plan.setAlternate(nil) } label: { Label("Take It Off", systemImage: "minus.circle") }
        }
    }

    private func suggestions(_ all: [APIAlternateCheck], filed: String?) -> some View {
        Section("Alternates That Will Do") {
            let offered = all.filter { $0.ident != filed }
            if offered.isEmpty {
                Text("None found within 100 nm. File one you have checked yourself.").foregroundStyle(.secondary)
            }
            ForEach(offered, id: \.ident) { s in
                Button { plan.setAlternate(s.ident) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text(s.ident).font(.body.monospaced()).foregroundStyle(.primary)
                            Text([s.distanceNm.map { Format.distance($0, decimals: 0) }, s.precision ? "ILS" : "nonprecision",
                                  Self.ceilingAndVisibility(s.ceilingFt, s.visibilitySm)].compactMap { $0 }.joined(separator: " · "))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Text(s.good == true ? "File" : "Check, File")
                    }
                }
                .accessibilityHint("Files it as the alternate")
            }
        }
    }

    /// "800 ft · 2 SM", a dash for what the forecast does not give.
    static func ceilingAndVisibility(_ ceilingFt: Double?, _ visibilitySm: Double?) -> String {
        let ceiling = ceilingFt.map { Format.altitude($0) } ?? "no ceiling"
        let visibility = visibilitySm.map { String(format: "%g SM", $0) } ?? "—"
        return "\(ceiling) · \(visibility)"
    }

    /// Where the alternate stands at its ETA, the engine's `good`: meets its
    /// minimums, under them, or the pilot's to check (nil).
    static func standing(_ a: APIAlternateCheck) -> String {
        switch a.good {
        case true?: a.minimums.map { "Meets \(Format.number($0.ceilingFt, decimals: 0))-\(String(format: "%g", $0.visibilitySm))" } ?? "Meets its minimums"
        case false?: "Under its minimums"
        case nil: "Check it"
        }
    }

    /// Its reasons where the engine gave any, else how far on and the kind
    /// of approach its minimums are for.
    static func description(_ a: APIAlternateCheck) -> String {
        if let reasons = a.reasons, !reasons.isEmpty { return reasons.joined(separator: " ") }
        let far = a.distanceNm.map { "\(Format.distance($0, decimals: 0)) on; " } ?? ""
        return "\(far)\(a.precision ? "an ILS" : "a nonprecision approach"), its minimums at the ETA there (14 CFR 91.169(c))."
    }
}

/// The plan's Alternate row, under IFR: the one filed, marked where it is
/// under its minimums, or "Add Alternate" where the destination needs one
/// and none is filed; it opens the alternate's page.
struct AlternateRow: View {
    @Environment(Plan.self) private var plan
    @Environment(AlternateCheck.self) private var check

    var body: some View {
        let filed = plan.extras.filedAlternate(rules: .saved())
        let under = check.answer?.alternate?.good == false
        let required = check.answer?.destination.required == true
        NavigationLink(value: SheetPage.flight("alternate")) {
            if let filed {
                LabeledContent {
                    Text(under ? "Under minimums" : filed).monospaced()
                        .foregroundStyle(under ? WingtipInk.problem : .secondary)
                } label: {
                    Label("Alternate", systemImage: under ? "exclamationmark.octagon.fill" : "arrow.triangle.branch")
                }
            } else {
                Label(required ? "Add Alternate, Required" : "Add Alternate", systemImage: "plus")
                    .foregroundStyle(required ? WingtipInk.caution : .accentColor)
            }
        }
        .accessibilityIdentifier("route-alternate")
    }
}

/// The alternate's own page, from the plan's row.
struct AlternatePage: View {
    @Environment(\.appCommand) private var appCommand
    var body: some View {
        List { AlternateSection(pickAirplane: { appCommand(.open(.airplane)) }) }
            .navigationTitle("Alternate")
    }
}
