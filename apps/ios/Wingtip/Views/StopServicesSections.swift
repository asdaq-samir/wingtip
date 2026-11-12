import SwiftUI

/// What the field offers on the ground, after the radio and the lights
/// (the web app's StopServices): what is on the field from its Chart
/// Supplement entry, its fuel first (the owner, 2026-11-11: "Fuel should
/// move to on the field section"), then the places to eat, sleep and hire
/// a car within five miles, nearest first. A place with a website opens
/// it, one with a phone calls it.
struct StopServicesSections: View {
    let ident: String
    /// A NOTAM in force on the fuel (notam_subject), its badge by the Fuel
    /// row and the row's tap opening it.
    var fuelMark: NotamMark?
    @Environment(FieldNotams.self) private var notams
    @State private var services: AirportServices?
    @State private var problem: String?

    var body: some View {
        Group {
            if let s = services {
                Section("On the Field") {
                    fuelRows(s)
                    ForEach(onTheField(s), id: \.title) { row in
                        CardRow(badge: RowBadge(systemImage: row.symbol, colour: row.colour), title: row.title, detail: row.detail) {
                            if let value = row.value { Text(value).foregroundStyle(.secondary) }
                        }
                    }
                }
                places("Food nearby", s.food, "fork.knife", Badge.food)
                places("Places to stay", s.lodging, "bed.double", Badge.lodging)
                places("Car rental", s.cars, "car", Badge.car)
                if s.nearbyUnavailable == true {
                    Section("Nearby") { Text("Places near the field could not be looked up").foregroundStyle(.secondary) }
                }
            } else if let problem {
                Section("Services") {
                    Text(problem).foregroundStyle(.secondary)
                    Button("Try Again") { Task { await load() } }
                }
            } else {
                Section("On the Field") {
                    ForEach(0..<2, id: \.self) { _ in
                        CardRow(badge: RowBadge(systemImage: "fuelpump", colour: Badge.fuel), title: "The fuel sold on the field")
                            .loading("Fetching the services")
                    }
                }
            }
        }
        .task(id: ident) { await load() }
    }

    /// The fuel, its badge where a NOTAM addresses it; the remarks in words
    /// as the planner gives them (the engine's remarks_read: self-serve, its
    /// hours, the FBO's) on a row of their own, in sight; and as sent,
    /// folded under As Written (the owner, 2026-11-11: "Decode fuel remarks
    /// too", "fuel remarks and as written can be separate from fuel").
    @ViewBuilder
    private func fuelRows(_ s: AirportServices) -> some View {
        NotamMarked(notams: notams, mark: fuelMark) {
            CardRow(badge: RowBadge(systemImage: "fuelpump", colour: Badge.fuel), title: "Fuel") {
                HStack(spacing: WingtipSpace.sm) {
                    if let fuelMark { NotamMarkBadge(mark: fuelMark) }
                    Text((s.fuelTypes ?? []).isEmpty ? "None listed" : AirportWords.fuelNames(s.fuelTypes ?? [])).fontWeight(.semibold)
                }
            }
        }
        if let notes = s.fuelNotes, !notes.isEmpty {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text("Fuel remarks")
                ForEach(notes, id: \.self) { Text($0).font(WingtipType.detail).foregroundStyle(.secondary) }
            }
            .accessibilityElement(children: .combine)
        }
        if let remarks = s.fuelRemarks, !remarks.isEmpty {
            DisclosureGroup("As Written") {
                Text(remarks.joined(separator: "\n")).font(.footnote.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
            }
        }
    }

    private func load() async {
        problem = nil
        do { services = try await Planner.services(ident) } catch { problem = "The services could not be fetched." }
    }

    private struct FieldRow { let symbol: String; let colour: Color; let title: String; var detail: String?; var value: String? }

    private func onTheField(_ s: AirportServices) -> [FieldRow] {
        let repair = [s.airframeRepair.map { "airframe \($0)" }, s.powerplantRepair.map { "engine \($0)" }].compactMap { $0 }.joined(separator: ", ")
        return [
            s.courtesyCar == true ? FieldRow(symbol: "car.fill", colour: Badge.car, title: "Courtesy car", detail: (s.groundNotes ?? []).joined(separator: " ")) : nil,
            s.tieDown == true ? FieldRow(symbol: "parkingsign", colour: Badge.runway, title: "Tie-downs") : nil,
            s.hangar == true ? FieldRow(symbol: "house.lodge", colour: Badge.runway, title: "Hangars") : nil,
            repair.isEmpty ? nil : FieldRow(symbol: "wrench.and.screwdriver", colour: Badge.other, title: "Repair", value: repair.prefix(1).uppercased() + repair.dropFirst()),
            s.oxygen == true ? FieldRow(symbol: "aqi.medium", colour: Badge.other, title: "Oxygen") : nil,
            s.landingFee.map { FieldRow(symbol: "doc.text", colour: Badge.other, title: "Landing fee", value: $0 ? "Yes" : "None") },
        ].compactMap { $0 }
    }

    @ViewBuilder
    private func places(_ title: String, _ list: [NearbyPlace]?, _ symbol: String, _ colour: Color) -> some View {
        if let list, !list.isEmpty {
            Section {
                ForEach(list) { place in
                    let row = CardRow(badge: RowBadge(systemImage: symbol, colour: colour), title: place.name, detail: place.kind) {
                        Text(AirportWords.away(place)).foregroundStyle(.secondary).monospacedDigit()
                    }
                    if let link = place.website.flatMap(URL.init(string:)) ?? place.phone.flatMap({ URL(string: "tel:" + $0.filter { !$0.isWhitespace }) }) {
                        Link(destination: link) { row }.foregroundStyle(.primary)
                    } else {
                        row
                    }
                }
            } header: {
                Text(title)
            } footer: {
                // Overture's credit under its places, as its licence asks.
                Text("Places © Overture Maps Foundation")
            }
        }
    }
}
