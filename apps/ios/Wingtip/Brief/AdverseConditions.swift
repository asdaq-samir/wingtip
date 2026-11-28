import SwiftUI

/// The Brief's Adverse Conditions (the web's adverse.ts and AdverseRows,
/// the owner's pick, 2026-11-21): the
/// standard briefing's first element (AIM 7-1-5(b)(1)), what the flight
/// meets on the route while it is there. The briefing's SIGMETs,
/// G-AIRMETs, TFRs and pilot reports are handed to the engine as one list
/// (`gonogo_adverse_rows`), which says which are adverse (a TFR crossed,
/// 14 CFR 91.137-91.145; an urgent PIREP, AIM 7-1-18), orders them stops
/// first and keeps at most three with a count of the rest. Their names are
/// the FAA's words as every page says them (the engine's sigmet_hazard,
/// gairmet_title and pirep_conditions). Nothing is decided here.
enum AdverseConditions {
    typealias Answer = EngineContract.GonogoAdverseRowsAnswer
    typealias Row = EngineContract.GonogoAdverseRowsAnswerRowsItem
    typealias Advisory = EngineContract.GonogoAdverseRowsInputAdvisoriesItem

    /// The rows for the briefing; none where it holds nothing on the route
    /// or the engine refused (the sections under it still say each one).
    static func rows(_ briefing: Briefing?) -> Answer? {
        guard let briefing else { return nil }
        let advisories = advisories(briefing)
        guard !advisories.isEmpty else { return nil }
        // Refused, no group: the briefing's own sections under it still
        // list every advisory.
        do { return try Engine.gonogoAdverseRows(advisories: advisories) } catch { return nil }
    }

    static func advisories(_ briefing: Briefing) -> [Advisory] {
        func met(_ source: String, _ name: String?, _ on: OnRoute?, issued: String? = nil, crosses: Bool = false, urgent: Bool = false) -> Advisory {
            Advisory(source: source, name: name, when: on?.when, enter: on?.enter, validTo: on?.validTo,
                     issued: issued, fromNm: on?.fromNm, legs: (on?.legs ?? []).map { Double($0) }, crosses: crosses, urgent: urgent)
        }
        let hazards = briefing.hazards.map { h in
            met(h.onRoute?.source ?? h.type ?? "SIGMET", try? Engine.sigmetHazard(hazard: h.hazard, kind: h.type), h.onRoute)
        }
        let gairmets = (briefing.gairmets ?? []).map { g in
            met("G-AIRMET", try? Engine.gairmetTitle(hazard: g.hazard, severity: g.severity), g.onRoute)
        }
        let tfrs = (briefing.tfrs ?? []).map { t in
            met("TFR", [t.notamId, t.title].compactMap { $0 }.joined(separator: " "), t.onRoute, crosses: t.crosses)
        }
        let pireps = (briefing.pireps ?? []).map { p in
            met("PIREP", pirepWords(p), p.onRoute,
                issued: p.onRoute?.issued ?? p.observedAt, urgent: p.urgent == true)
        }
        return hazards + gairmets + tfrs + pireps
    }

    /// A pilot report's conditions in the FAA's words; none where the
    /// engine refused, and the row is then named by its kind alone.
    private static func pirepWords(_ p: Pirep) -> String? {
        do { return try Engine.pirepConditions(turbulence: p.turbulence, icing: p.icing) } catch { return nil }
    }

    /// Where and when the flight meets it, under its name: the legs it is
    /// on (1-based, as the nav log numbers them), then when a TFR is met,
    /// until when an advisory holds, or when a pilot report was made.
    static func when(_ row: Row) -> String {
        let legs: String? = row.legs.first.map { first in
            let last = row.legs.last ?? first
            return first == last ? "Leg \(Int(first) + 1)" : "Legs \(Int(first) + 1)–\(Int(last) + 1)"
        }
        let at: String? = row.time.flatMap { AirportWords.date($0) }.map { date in
            let clock = "\(Format.time(date)) \(TimeZone.current.abbreviation(for: date) ?? "")".trimmingCharacters(in: .whitespaces)
            switch row.timeKind {
            case "at": return "in force at \(clock)"
            case "until": return "until \(clock)"
            default: return "reported \(clock)"
            }
        }
        let said = [legs, at].compactMap { $0 }.joined(separator: " · ")
        return said.isEmpty ? "During the flight" : Format.capital(said)
    }
}

/// The Brief's Adverse Conditions group, under the Go / No-Go's findings:
/// a row for each the engine keeps, its finding's glyph and colour (never
/// colour alone), its legs and time under it; a tap goes to its part of
/// the Brief. Nothing drawn where there are none (the owner's "nothing
/// empty", 2026-11-16).
struct AdverseConditionsSection: View {
    let answer: AdverseConditions.Answer?
    /// The Brief's part a row opens, by the advisory's source.
    let open: (String) -> Void

    var body: some View {
        if let answer, !answer.rows.isEmpty {
            Section("Adverse Conditions") {
                ForEach(Array(answer.rows.enumerated()), id: \.offset) { n, row in
                    Button { open(row.source) } label: {
                        Label {
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(row.title).lineLimit(2).foregroundStyle(.primary)
                                Text(AdverseConditions.when(row)).font(WingtipType.detail).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: FindingStyle.symbol(row.finding)).foregroundStyle(FindingStyle.colour(row.finding))
                        }
                    }
                    .accessibilityHint(FindingStyle.word(row.finding))
                    .accessibilityIdentifier("brief-adverse-\(n)")
                }
                if answer.more > 0 {
                    Text("\(answer.more) more on the route").foregroundStyle(.secondary)
                        .accessibilityIdentifier("brief-adverse-more")
                }
            }
        }
    }
}
