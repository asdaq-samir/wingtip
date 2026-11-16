import CoreLocation
import SwiftUI

/// The airspace over a point the pilot held a finger on, as the web
/// app's AirspaceCard: the chart's own question in the oral exam. From
/// the ground up, each class's altitudes (feet MSL), its VFR weather
/// minimums by day and night (14 CFR 91.155), what it takes to go in,
/// what the airplane must carry and the speed limit; then the Class B
/// veil, the special-use areas and the TFRs over it. Every rule is the
/// planner's answer; the card writes it.
struct AirspaceCard: View {
    @Environment(Navigator.self) private var nav
    let lat: Double
    let lon: Double
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var here: AirspaceAt?
    @State private var problem: String?
    /// SFDPS's word on each special-use area now, by its name (/api/live/saa).
    @State private var saa: [String: SaaStatus] = [:]

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    Text(AirportWords.degreesMinutes(lat: lat, lon: lon)
                        + (here?.groundFt.map { " · ground \(Format.altitude($0))" } ?? ""))
                        .monospacedDigit()
                    if let named = here?.point {
                        Text("\(named.ident) · \(named.name)").foregroundStyle(.secondary)
                    }
                }
                // The point into the route, named off its nearest fix
                // (wingtip.fixes.frd_near), as Maps' dropped pin offers its
                // directions: a point's card's actions (CardKind.point, the
                // web's CARD_ACTIONS) -- flown to direct from where the
                // airplane is, added where it bends the route least, or
                // held at (the web app's dropIntoRoute), once the route has
                // its course.
                if let named = here?.point {
                    let at = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    GlassRow {
                        Button { plan.drop(named.ident, at: at, then: .direct, from: dryRun.fix ?? ownShip.fix) } label: {
                            CardActionLabel(.directTo)
                        }
                        .glassProminentButton()
                        .disabled(plan.course == nil)
                        Button {
                            if plan.course != nil { plan.drop(named.ident, at: at, then: .add, from: nil) } else { plan.stops.append(named.ident); plan.plan() }
                        } label: {
                            CardActionLabel(.addToRoute)
                        }
                        .glassButton()
                        .disabled(!plan.routed)
                        Button {
                            plan.drop(named.ident, at: at, then: .hold, from: nil)
                            nav.push(.hold(named.ident))
                        } label: {
                            CardActionLabel(.holdHere)
                        }
                        .glassButton()
                        .disabled(plan.course == nil)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    // Four actions across, as the airport card's: they stop
                    // growing at the second accessibility size.
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                }
            }
            if let here {
                Section("Airspace Here") {
                    ForEach(here.bands) { band in BandRow(band: band, ground: here.groundFt) }
                }
                if let veil = here.modeCVeil {
                    Section {
                        // 14 CFR 91.215(b)(2) and 91.225(d)(2): within 30 nm
                        // of an airport in part 91's appendix D, section 1,
                        // from the surface to 10,000 ft MSL.
                        CardRow(badge: RowBadge(systemImage: "dot.radiowaves.left.and.right", colour: Badge.rule), title: "In a Mode C veil",
                                detail: "\(Format.distance(veil.distanceNm)) from \(veil.ident): a transponder with altitude reporting and ADS-B Out from the surface to 10,000 ft (91.215, 91.225).")
                    }
                }
                Section("Special Use") {
                    if here.specialUseUnavailable == true {
                        ProblemLine("The FAA's special-use airspace did not answer. Check the chart.")
                    } else if (here.specialUse ?? []).isEmpty {
                        Text("None here").foregroundStyle(.secondary)
                    } else {
                        ForEach(here.specialUse ?? []) { area in
                            CardRow(badge: RowBadge(systemImage: "exclamationmark.shield", colour: Badge.hazard),
                                    title: "\(AirportWords.faaWords(area.name)) · \(area.kind)",
                                    detail: [AirportWords.suaAltitudes(area), area.timesOfUse.map { AirportWords.faaWords($0) }, area.controllingAgency]
                                        .compactMap { $0 }.joined(separator: " · "))
                            // SFDPS's word on it now, where it has one (LiveWords.saaBadge).
                            if let status = LiveWords.saaBadge(saa[area.name]) {
                                HStack(spacing: WingtipSpace.sm) {
                                    StatusBadge(status.status)
                                    Text(status.rest).font(.subheadline).foregroundStyle(.secondary)
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                }
                Section("TFRs") {
                    if here.tfrsUnavailable == true {
                        Link("tfr.faa.gov did not answer. Check it before flight.", destination: URL(string: "https://tfr.faa.gov")!)
                            .foregroundStyle(WingtipInk.caution)
                    } else if (here.tfrs ?? []).isEmpty {
                        Text("None here now or to come").foregroundStyle(.secondary)
                    } else {
                        // Each TFR's own card (TfrCard), as a tap on one
                        // reaches it, Active or Later as a badge (rules.md §9).
                        ForEach(here.tfrs ?? []) { TfrHereRow(tfr: $0) }
                    }
                }
            } else if let problem {
                Section {
                    ProblemLine(problem)
                    Button("Try Again") { Task { await load() } }
                }
            } else {
                Section { ProgressView("Fetching the airspace here…") }
            }
        }
        .navigationTitle("Airspace")
        .task(id: "\(lat),\(lon)") {
            await load()
            // Each area's status from SFDPS, asked again each minute while
            // the card is open (the web's saaQuery); none said where it fails.
            let names = (here?.specialUse ?? []).map(\.name)
            while !names.isEmpty, !Task.isCancelled {
                if let found = try? await Planner.liveSaa(names) { saa = found }
                try? await Task.sleep(for: .seconds(AirportLive.rvrEveryS))
            }
        }
    }

    /// The planner's answer; with no connection, the engine's from the
    /// cycle packs kept on the phone (CyclePacks), the same bands but for
    /// the ground's height, the TFRs and the fix the point is named off,
    /// which only the planner has.
    private func load() async {
        problem = nil
        do { here = try await Planner.airspaceAt(lat: lat, lon: lon) } catch {
            if let kept = CyclePacks.shared.airspaceAt(lat: lat, lon: lon) {
                here = kept
            } else {
                problem = "The planner could not read the airspace here. Try again in a moment."
            }
        }
    }

    /// The TFR's page on tfr.faa.gov.
    static func tfrPage(_ notamId: String) -> URL {
        URL(string: "https://tfr.faa.gov/tfr3/?page=detail_\(notamId.replacingOccurrences(of: "/", with: "_"))")!
    }
}

/// One class of airspace: its letter in the chart's own ink, its range
/// first, then its rules each on a line with its glyph.
struct BandRow: View {
    let band: AirspaceBand
    let ground: Double?
    /// The class's box grows with its letter, so it is never clipped.
    @ScaledMetric(relativeTo: .subheadline) private var side = 28.0

    /// Solid blue for B, magenta for C, dashed blue for D, dashed
    /// magenta for E, as the sectional draws them.
    static func ink(_ cls: String) -> (colour: Color, solid: Bool, dashed: Bool) {
        let blue = Color(uiColor: WingtipColor.Chart.towered), magenta = Color(uiColor: WingtipColor.Chart.untowered)
        switch cls {
        case "B": return (blue, true, false)
        case "C": return (magenta, true, false)
        case "D": return (blue, false, true)
        case "E": return (magenta, false, true)
        default: return (Color.secondary, false, false)
        }
    }

    /// The band's rules in lines: its minimums (one line where day and
    /// night agree), what it takes to go in, the equipment, the speed
    /// limit (14 CFR 91.117).
    static func rules(_ band: AirspaceBand) -> [(symbol: String, text: String)] {
        var out: [(symbol: String, text: String)] = []
        if let m = band.minimums {
            let day = AirportWords.minimumsLine(m.day), night = AirportWords.minimumsLine(m.night)
            out.append(("cloud", day == night ? "VFR \(day)" : "VFR by day \(day); at night \(night)"))
        }
        if !band.entry.isEmpty, band.entry != "Nothing.", band.entry != "Nothing for VFR." { out.append(("key", band.entry)) }
        if let equipment = band.equipment { out.append(("antenna.radiowaves.left.and.right", equipment)) }
        if let speed = band.speedKt, speed > 0 { out.append(("gauge.with.dots.needle.67percent", "\(speed) kt at most (91.117)")) }
        return out
    }

    var body: some View {
        let ink = Self.ink(band.airspaceClass)
        HStack(alignment: .top, spacing: WingtipSpace.md) {
            Text(band.airspaceClass)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(ink.solid ? Color.white : ink.colour)
                .frame(width: side, height: side)
                .background(ink.solid ? ink.colour : Color.clear, in: RoundedRectangle(cornerRadius: WingtipRadius.badge))
                .overlay(RoundedRectangle(cornerRadius: WingtipRadius.badge).strokeBorder(ink.colour, style: StrokeStyle(lineWidth: 2, dash: ink.dashed ? [3, 2] : [])))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                Text("\(Text("Class \(band.airspaceClass)").fontWeight(.semibold))\(Text(band.name.map { " · " + AirportWords.shortAirspaceName($0) } ?? "").foregroundStyle(.secondary))")
                Text(AirportWords.bandRange(band, ground: ground)).fontWeight(.semibold).monospacedDigit()
                ForEach(Array(Self.rules(band).enumerated()), id: \.offset) { _, rule in
                    Label(rule.text, systemImage: rule.symbol).font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// 14 CFR 91.155's minimums as the planner sends them: Class G under
/// 1,200 ft AGL by day 1 sm clear of clouds, at night 3 sm and
/// 500/1,000/2,000 ft; Classes D and E below 10,000 ft MSL 3 sm and
/// 500/1,000/2,000 ft, day and night.
private enum PreviewData {
    static let basic = VfrMinimums(aboveFt: 1000, belowFt: 500, clearOfClouds: false, horizontalFt: 2000, visibilitySm: 3)
    static let controlled = DayNightMinimums(day: basic, night: basic)
    static let ground = 1428.0
}

#Preview("BandRow") {
    List {
        BandRow(band: AirspaceBand(ceilingFt: 2628, airspaceClass: "G", entry: "Nothing.", floorFt: PreviewData.ground, minimums: DayNightMinimums(day: VfrMinimums(clearOfClouds: true, visibilitySm: 1), night: PreviewData.basic)),
                ground: PreviewData.ground)
        // 91.117(b): 200 kt in Class D at or below 2,500 ft AGL within 4 nm of the field.
        BandRow(band: AirspaceBand(ceilingFt: 3900, airspaceClass: "D", entry: "Two-way radio contact with the tower before entering (91.129).", equipment: "A two-way radio.", floorFt: PreviewData.ground, minimums: PreviewData.controlled, name: "DULUTH CLASS D", speedKt: 200),
                ground: PreviewData.ground)
        // 91.117(a): 250 kt below 10,000 ft MSL.
        BandRow(band: AirspaceBand(ceilingFt: 18000, airspaceClass: "E", entry: "Nothing for VFR.", floorFt: 3900, minimums: PreviewData.controlled, name: "DULUTH CLASS E", speedKt: 250),
                ground: PreviewData.ground)
    }
}

/// A TFR over the point, now or to come: its number and kind, Active or
/// Later as a badge (rules.md §9), a tap its own card (TfrCard).
private struct TfrHereRow: View {
    let tfr: TfrHere

    var body: some View {
        NavigationLink(value: SheetPage.tfr(tfr.notamId)) {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                CardRow(badge: RowBadge(systemImage: "nosign", colour: tfr.activeNow ? Badge.hazard : Badge.other),
                        title: "TFR \(tfr.notamId)" + (tfr.kind.map { " · \($0)" } ?? ""), detail: tfr.title ?? "")
                StatusBadge(tfr.activeNow ? .active : .later)
            }
        }
    }
}
