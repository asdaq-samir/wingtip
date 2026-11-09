import SwiftUI

/// The best fields from where the airplane is, in the engine's order
/// (reach, then the runway against the POH, then the distance), a tap
/// picking the one the map's line goes to. Each row: the heading to fly
/// and how far, and the engine's reasons under it, the reach first in its
/// tone. Nothing is hidden for a limitation; it is said.
struct EmergencyFieldsSection: View {
    let fix: OwnShip.Fix?
    let ownShipOff: Bool
    private var model: Emergency { .shared }

    var body: some View {
        Section {
            if fix == nil {
                CardRow(title: ownShipOff ? "Your position is off" : "Finding your position…",
                        detail: "The fields within a glide are worked out from it")
            } else if let ranked = model.ranked {
                if ranked.needsAirplane {
                    // No airplane, or one with no glide ratio: the nearest
                    // first, and the glide ratio asked for in place, never
                    // guessed (the owner, 2026-11-09).
                    AskFigureRow(needs: [.glide], pickDetail: "Its glide ranks the fields within reach; nearest first meanwhile")
                }
                ForEach(ranked.fields, id: \.ident) { field in
                    Button { model.pickedIdent = field.ident } label: { row(field, picked: field.ident == model.picked?.ident) }
                        .accessibilityAddTraits(field.ident == model.picked?.ident ? .isSelected : [])
                }
            } else if let problem = model.problem {
                ProblemLine(problem)
            } else {
                ProgressView("Fetching the fields round you…")
            }
        } header: {
            SectionTitle(model.ranked?.glide.map { "Best Fields · Glide About \(Format.distance($0.stillAirNm, decimals: 0))" } ?? "Best Fields")
        }
        // The best field said by VoiceOver as it is found and each time
        // another takes its place: a pilot in an emergency is not reading
        // the list.
        .onChange(of: model.ranked?.fields.first?.ident, initial: true) { _, ident in
            guard ident != nil, let best = model.ranked?.fields.first else { return }
            Announce.alert(Self.spokenBest(best), urgent: true)
        }
    }

    /// The heading to a field said, magnetic where the variation is
    /// known, else true, as the row writes it.
    static func spokenHeading(_ field: Emergency.Field) -> String {
        if let mag = field.headingMagDeg { return Format.spokenHeadingMagnetic(mag) }
        return field.headingTrueDeg.map(Format.spokenHeadingTrue) ?? Format.spokenNone
    }

    /// "Best field KXYZ, heading zero four five degrees magnetic, four point
    /// two nautical miles".
    static func spokenBest(_ field: Emergency.Field) -> String {
        "Best field \(field.ident), heading \(spokenHeading(field)), \(Format.spokenDistance(field.distanceNm))"
    }

    private func row(_ field: Emergency.Field, picked: Bool) -> some View {
        HStack(alignment: .top, spacing: WingtipSpace.md) {
            Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                .symbolSwap()
                .foregroundStyle(picked ? Color.accentColor : Color.secondary)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                (Text(field.ident).fontWeight(.semibold) + Text(" \(field.name)")).foregroundStyle(Color.primary)
                ForEach(Array(field.reasons.enumerated()), id: \.offset) { i, reason in
                    let lead = i == 0 && field.reach != "unknown"
                    Text(reason.text).font(.subheadline)
                        .fontWeight(lead ? .semibold : .regular)
                        .foregroundStyle(Self.tone(reason.tone, plain: !lead))
                }
            }
            Spacer(minLength: WingtipSpace.sm)
            VStack(alignment: .trailing, spacing: WingtipSpace.xxs) {
                // The heading to fly, magnetic where the variation is known, else true.
                if let heading = field.headingMagDeg ?? field.headingTrueDeg {
                    Text(Format.heading(heading) + (field.headingMagDeg == nil ? " T" : "")).fontWeight(.semibold)
                        .accessibilityLabel("heading " + Self.spokenHeading(field))
                }
                Text(Format.distance(field.distanceNm)).foregroundStyle(.secondary)
                    .accessibilityLabel(Format.spokenDistance(field.distanceNm))
            }
            .monospacedDigit()
        }
    }

    /// A reason's ink by its tone, as the Brief's findings are toned.
    static func tone(_ tone: String, plain: Bool) -> Color {
        switch tone {
        case "stop": WingtipInk.problem
        case "caution": WingtipInk.caution
        default: plain ? Color.secondary : WingtipInk.go
        }
    }
}

/// What to do on the radio and the transponder, the engine's mayday_call:
/// squawk 7700 (AIM 6-2-2), the frequencies to try -- the one in use, the
/// nearest approach and tower the FAA lists, 121.5 (AIM 6-3-1(d)) -- and
/// the MAYDAY in AIM 6-3-2(a)(3)'s order, what the app does not know left
/// in brackets to say, with the two the pilot can tell it here. The
/// phones: the field picked's own, as the FAA lists it, and 911.
struct EmergencyRadioSections: View {
    let mayday: Result<Emergency.Mayday, any Error>
    let phoneIdent: String?
    let phone: String?
    private var model: Emergency { .shared }

    var body: some View {
        if case .success(let call) = mayday {
            Section(title: "Transponder and Radio") {
                CardRow(title: "Squawk \(call.squawk)", detail: call.squawkWords)
                ForEach(call.channels, id: \.label) { channel in
                    CardRow(title: channel.label, detail: channel.why) {
                        if let mhz = channel.mhz { Text(Format.number(mhz, decimals: 3)).fontWeight(.semibold).monospacedDigit() }
                    }
                    .frequencyActions(channel.mhz.map { Format.number($0, decimals: 3) })
                }
            }
            Section(title: "MAYDAY") {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    ForEach(Array(call.lines.enumerated()), id: \.offset) { _, line in
                        Text(line).fontWeight(.medium).foregroundStyle(line.hasPrefix("[") ? Color.secondary : Color.primary)
                    }
                }
                LabeledContent("People on Board") {
                    TextField("2", text: Binding(get: { model.souls }, set: { model.souls = $0 })).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
                LabeledContent("Fuel, Minutes") {
                    TextField("90", text: Binding(get: { model.fuelMin }, set: { model.fuelMin = $0 })).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
            }
        } else {
            Section(title: "MAYDAY") { ProblemLine(mayday, "The call") }
        }
        Section(title: "Phone") {
            if let phone, let phoneIdent, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Link("Call \(phoneIdent)", destination: url)
            }
            Link("Call 911", destination: URL(string: "tel:911")!)
        }
    }
}
