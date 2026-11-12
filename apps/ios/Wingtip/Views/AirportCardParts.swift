import SwiftUI
import UIKit

/// The airport card's parts under its head (AirportPlaceHead), as Maps'
/// place card has them (the owner's screenshot, 2026-11-09): the card for
/// the plan through this field, the row of picture tiles, and the
/// floating glass toolbar at its foot. The red alert cards that stood
/// under the head are gone, as on the web, where the owner turned that
/// pattern down: a NOTAM's badge sits on the thing it addresses instead.

/// Ready to fly, where the field is on the plan: the engine's verdict's
/// line (the Go / No-Go the Brief holds), a tap from the Brief.
struct AirportReadyCard: View {
    let ident: String
    @Environment(Plan.self) private var plan
    @Environment(Verdict.self) private var verdict

    var body: some View {
        if plan.routed, plan.idents.contains(ident), let line = verdict.answer?.line {
            Section {
                NavigationLink(value: SheetPage.screen(.brief)) {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text("Ready to Fly").font(.headline)
                        Text(line.words).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .accessibilityHint("Opens the Brief")
            }
        }
    }
}

/// The field's picture tiles, a row that pages as Maps' does, each titled
/// over its picture: the approaches, the diagram, the field from the air
/// and the ground, the frequencies and the field's own NOTAMs
/// (/api/airport/{ident}/notams). A picture opens full screen in the
/// app's viewer; the others open the card's own tab or the NOTAM list.
struct AirportTiles: View {
    @Environment(\.lookAccent) private var accent
    let place: AirportPlace
    let photos: AirportPhotos?
    @Binding var shown: ShownPicture?
    @Binding var tab: AirportCard.CardTab
    /// The field's own NOTAMs, for the tile's count.
    let notams: APINotamsRanked?
    @ScaledMetric(relativeTo: .title3) private var height = 150.0

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: WingtipSpace.md) {
                // The diagram first (the owner's A2 pick), then the approaches.
                if let cycle = place.airportDiagramCycle {
                    tileButton("Diagram", picture: Planner.diagramPath(ident: place.ident, cycle: cycle, runwaysOnly: true), fit: true) {
                        shown = .paths("\(place.ident) airport diagram", [Planner.diagramPath(ident: place.ident, cycle: cycle)])
                    }
                }
                tileButton("Approaches", systemImage: "airplane.arrival", count: approaches) { tab = .charts }
                if let photos {
                    tileButton("From the Air", picture: photos.aerialUrl) { shown = .paths("\(place.ident) from the air", [photos.aerialUrl]) }
                    if let photo = photos.photo {
                        let credit = photo.credit + ((photo.license ?? "").isEmpty ? "" : " · " + (photo.license ?? ""))
                        tileButton("From the Ground", picture: photo.url) {
                            shown = .paths("\(place.ident) from the ground", [photo.url], credit: credit)
                        }
                    }
                }
                tileButton("Frequencies", systemImage: "antenna.radiowaves.left.and.right", count: place.frequencies.count) { tab = .info }
                let count = notams?.notams.count ?? 0
                NavigationLink(value: SheetPage.notams(.field(place.ident))) {
                    face(count > 0 ? "NOTAMs · \(count)" : "NOTAMs", systemImage: "exclamationmark.bubble")
                }
                .buttonStyle(.plain)
                .accessibilityLabel(count > 0 ? "\(place.ident) NOTAMs, \(count)" : "\(place.ident) NOTAMs")
            }
            .scrollTargetLayout()
            .padding(.horizontal, WingtipSpace.lg)
        }
        // A flick comes to rest on a tile, not between two.
        .scrollTargetBehavior(.viewAligned)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }

    private var approaches: Int {
        (place.procedures ?? []).filter { $0.kind == "IAP" }.count
    }

    private func tileButton(_ title: String, systemImage: String, count: Int, action: @escaping () -> Void) -> some View {
        Button(action: action) { face(count > 0 ? "\(title) · \(count)" : title, systemImage: systemImage) }
            .buttonStyle(.plain)
            .accessibilityLabel(count > 0 ? "\(title), \(count)" : title)
    }

    private func tileButton(_ title: String, picture: String, fit: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            RemotePicture(path: picture, fit: fit)
                .frame(width: height * 1.3, height: height)
                .background(fit ? Color.white : Color.clear)
                .overlay(alignment: .topLeading) { caption(title, onPicture: true) }
                .clipShape(RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title), full screen")
    }

    private func face(_ words: String, systemImage: String) -> some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous).fill(accent.opacity(0.14))
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.tint)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(WingtipSpace.lg)
                .accessibilityHidden(true)
            caption(words, onPicture: false)
        }
        .frame(width: height * 1.3, height: height)
    }

    private func caption(_ words: String, onPicture: Bool) -> some View {
        Text(words)
            .font(.title3.weight(.semibold))
            .foregroundStyle(onPicture ? Color.white : Color.primary)
            .shadow(color: onPicture ? .black.opacity(0.5) : .clear, radius: 3)
            .padding(WingtipSpace.md)
    }
}

/// The card's foot, the system's floating glass toolbar (iOS 26 and
/// later; the bar before): Add to Plan's menu (Fly Here, Depart From, Add
/// as Stop), Share, and ••• with Directions and Copy. Call and Favorite are
/// the head's action tiles, as the web's (AirportPlaceHead).
struct AirportCardToolbar: ToolbarContent {
    let place: AirportPlace
    let plan: Plan
    let fix: OwnShip.Fix?
    let done: () -> Void
    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .bottomBar) {
            Menu {
                Button { Task { await plan.flyHere(place.ident, near: fix); done() } } label: {
                    Label(CardAction.flyHere.title, systemImage: CardAction.flyHere.systemImage)
                }
                Button { plan.departFrom(place.ident); done() } label: {
                    Label(CardAction.departFrom.title, systemImage: CardAction.departFrom.systemImage)
                }
                Button { plan.addStop(place.ident); done() } label: {
                    Label(CardAction.addStop.title, systemImage: CardAction.addStop.systemImage)
                }
                .disabled(!plan.canAddStop(place.ident))
            } label: {
                Label("Add to Plan", systemImage: "plus")
            }
            ShareLink(item: URL(string: "https://\(Config.host)/app/plan?place=\(place.ident)")!, subject: Text(place.name)) {
                Label("Share", systemImage: WingtipIcon.share)
            }
            Menu {
                Link(destination: AirportCard.mapsLink(place)) { Label("Directions in Maps", systemImage: CardAction.address.systemImage) }
                Button { UIPasteboard.general.string = place.ident } label: { Label("Copy \(place.ident)", systemImage: WingtipIcon.copy) }
            } label: {
                Label("More", systemImage: "ellipsis")
            }
        }
    }
}
