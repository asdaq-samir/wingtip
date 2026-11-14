import CoreLocation
import SwiftUI
import UIKit

/// A VOR's link key, "OBK@42.2214,-87.9517" (the web's navaidAt): its
/// ident and its place to four places, as one ident names navaids in more
/// than one place ("AA", wingtip.fixes). A tap on its mark and its link
/// (`navaid=`) open the same card.
struct NavaidKey: Equatable {
    let ident: String
    let lat: Double
    let lon: Double

    init(ident: String, lat: Double, lon: Double) {
        (self.ident, self.lat, self.lon) = (ident, lat, lon)
    }

    /// Read from a link's or a card's key; nil where it is not one.
    init?(_ text: String) {
        let parts = text.split(separator: "@", maxSplits: 1).map(String.init)
        guard parts.count == 2, (2...4).contains(parts[0].count), parts[0].allSatisfy({ $0.isUppercase || $0.isNumber }) else { return nil }
        let at = parts[1].split(separator: ",").compactMap { Double($0) }
        guard at.count == 2, (-90...90).contains(at[0]), (-180...180).contains(at[1]) else { return nil }
        self.init(ident: parts[0], lat: at[0], lon: at[1])
    }

    var text: String { "\(ident)@\(String(format: "%.4f", lat)),\(String(format: "%.4f", lon))" }
}

/// A VOR's card, from a tap on its mark or its link (the web's VorCard, the
/// owner's iPhone screenshot of OBK's, 2026-11-14), laid out as every card:
/// "OBK VOR/DME" with "Northbrook · 113.0" under it, Share at the bar's
/// start; the navaid's actions -- Direct To, Add to Route (greyed with no
/// route; Direct To also with no position) and its frequency to copy, no
/// Favorite (the Favorites hold airports and airplanes); the radial own
/// ship is on; then its identifier in Morse, DME channel, standard service
/// volume (AIM 1-1-8), elevation, declination, hours and remarks. Every
/// figure is NASR's, read by the engine from the phone's cycle packs; the
/// rules (the radial, the Morse, the service volume, the hours) are the
/// engine's.
struct NavaidCard: View {
    let key: String
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var vor: VorPin?
    @State private var missing = false
    @State private var copied = false

    var body: some View {
        List {
            if let vor {
                head(vor)
                rows(vor)
            } else if missing {
                Section {
                    Text("This VOR is not in the regions kept on this phone, or not in this cycle's data.").foregroundStyle(.secondary)
                }
            } else {
                Section { ProgressView("Finding it…") }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(vor.map { "\($0.ident) \($0.kind)" } ?? NavaidKey(key)?.ident ?? "VOR")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let vor {
                ToolbarItem(placement: .topBarLeading) {
                    ShareLink(item: Self.link(vor.key), subject: Text("\(vor.ident) \(vor.kind)")) {
                        Label("Share", systemImage: WingtipIcon.share)
                    }
                }
            }
        }
        .task(id: key) { await find() }
    }

    /// Its own link, which opens this card.
    static func link(_ key: String) -> URL {
        Config.gateway.appending(path: Screen.linkPath).appending(queryItems: [URLQueryItem(name: LinkKey.navaid.rawValue, value: key)])
    }

    /// The VOR in the packs' answer for a box about its place, by its ident.
    private func find() async {
        guard let at = NavaidKey(key) else { missing = true; return }
        let box = ViewBox(south: at.lat - 0.05, west: at.lon - 0.05, north: at.lat + 0.05, east: at.lon + 0.05)
        let found = await CyclePacks.shared.vorsInView(box)
        vor = (found ?? nil)?.first { $0.ident == at.ident }
        missing = vor == nil
    }

    /// The frequency as the dial shows it, "113.0" (NASR files "113").
    private func dial(_ vor: VorPin) -> String? {
        guard let freq = vor.freq else { return nil }
        return Double(freq).map(AirportWords.mhz) ?? freq
    }

    @ViewBuilder private func head(_ vor: VorPin) -> some View {
        let at = CLLocationCoordinate2D(latitude: vor.lat, longitude: vor.lon)
        let fix = dryRun.fix ?? ownShip.fix
        Section {
            VStack(spacing: WingtipSpace.xs) {
                Text("\(vor.ident) \(vor.kind)").font(WingtipType.card).accessibilityAddTraits(.isHeader)
                let line = [vor.name, dial(vor)].compactMap { $0 }.joined(separator: " · ")
                if !line.isEmpty { Text(line).font(.subheadline).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
            GlassRow {
                Button { plan.drop(vor.ident, at: at, then: .direct, from: fix) } label: { CardActionLabel(.directTo) }
                    .glassProminentButton()
                    .disabled(plan.course == nil || fix == nil)
                Button { plan.drop(vor.ident, at: at, then: .add, from: nil) } label: { CardActionLabel(.addToRoute) }
                    .glassButton()
                    .disabled(plan.course == nil)
                Button {
                    UIPasteboard.general.string = dial(vor)
                    copied = true
                } label: {
                    VStack(spacing: WingtipSpace.xs) {
                        Image(systemName: CardAction.copy.systemImage).font(WingtipType.heading)
                        Text(copied ? "Copied" : dial(vor) ?? CardAction.copy.title).font(WingtipType.tabBar.weight(.semibold)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
                }
                .glassButton()
                .disabled(dial(vor) == nil)
                .accessibilityLabel(copied ? "Copied" : "Copy \(dial(vor) ?? "the frequency")")
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
            if let fix, let on = try? Engine.radialOf(station: .init(ident: vor.ident, lat: vor.lat, lon: vor.lon, magVar: vor.magVar),
                                                      at: .init(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude)) {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text("On the \(Format.heading(on.radial)) radial · \(Format.distance(on.nm))").font(.headline.monospacedDigit())
                    Text("\(Format.heading(on.toCourse))° to fly to it").font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder private func rows(_ vor: VorPin) -> some View {
        Section {
            // Its identifier as it sends it: the only sure way to know the
            // station tuned is the one meant (AIM 1-1-3).
            if let morse = try? Engine.morse(ident: vor.ident) {
                LabeledContent("Identifier") { Text(morse).fontWeight(.semibold) }
                    .accessibilityValue(SpokenFigures.digits(vor.ident))
            }
            if let channel = vor.channel { LabeledContent("DME channel", value: channel) }
            if let volume = try? Engine.serviceVolume(code: vor.serviceVolume) {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text("Service volume")
                    Text(volume).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            if let elevation = vor.elevationFt { LabeledContent("Elevation", value: Format.altitude(elevation)) }
            if let east = vor.magVar { LabeledContent("Declination", value: "\(Format.tenths(abs(east)))° \(east < 0 ? "W" : "E")") }
            if let hours = try? Engine.navaidHours(hours: vor.hours) { LabeledContent("Hours", value: hours) }
        }
        // Where its signal is not to be used, as the Chart Supplement lists
        // it (NASR NAV_RMK), folded: a busy station's run to a screenful.
        if let remarks = vor.remarks, !remarks.isEmpty {
            Section {
                DisclosureGroup {
                    ForEach(remarks, id: \.self) { Text($0).font(.subheadline).foregroundStyle(.secondary) }
                } label: {
                    Text(vor.restricted == true ? "Restrictions" : "Remarks").foregroundStyle(vor.restricted == true ? WingtipInk.caution : .primary)
                }
            }
        }
        Section { Text(AirportWords.degreesMinutes(lat: vor.lat, lon: vor.lon)).monospacedDigit() }
    }
}
