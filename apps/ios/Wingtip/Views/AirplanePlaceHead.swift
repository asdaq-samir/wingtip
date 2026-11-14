import SwiftUI

/// The airplane card's head in the owner's P1 layout (2026-11-14, the
/// canvas XFZoWyJWzov7RCwRRPH253; the web's AirplaneProfileSheet), built as
/// the airport card's is (AirportPlaceHead): at full height the type's
/// silhouette on a tile, then the N-number large and centred with the
/// registry's make, model and year under it ("Piper PA-28-140, 1971"), its
/// Planespotters.net photo with its credit once that answers with one, and
/// one row of four -- Fly This filled, Follow (tell me when it takes off or
/// lands), Favorite and Share. Follow and Favorite go by the ICAO address
/// the registry gives, greyed where it gives none.
struct AirplanePlaceHead: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Tracking.self) private var tracking
    @Environment(\.undoManager) private var undoManager
    let model: AirplaneProfileModel
    let lookup: AirplaneLookup
    let fly: () -> Void
    @Environment(Plan.self) private var plan
    @Environment(\.cardExpanded) private var expanded
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .title) private var tile = 84.0

    var body: some View {
        VStack(spacing: WingtipSpace.md) {
            if expanded {
                Image(systemName: WingtipIcon.airplane)
                    .font(.largeTitle)
                    .foregroundStyle(.tint)
                    .frame(width: tile, height: tile)
                    .background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                    .accessibilityHidden(true)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
            VStack(spacing: WingtipSpace.xs) {
                Text(model.tail).font(WingtipType.card.monospaced()).accessibilityAddTraits(.isHeader)
                Text(model.loaded ? model.typeLine ?? "Not in the FAA's registry" : "Looking it up in the FAA's registry")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            if let photo = lookup.photo { AirplanePhotoHead(photo: photo) }
            actions
        }
        .padding(.horizontal, WingtipSpace.lg)
        .padding(.vertical, WingtipSpace.md)
        .animation(.default, value: expanded)
    }

    /// The registry's ICAO address, for Follow, Favorite and its flights.
    private var hex: String? { model.registration?.modeSHex?.lowercased() }

    private var kept: KeptAirplane? { hex.map { KeptAirplane(hex: $0, name: model.tail, type: model.typeLine) } }

    private var actions: some View {
        let flying = plan.tail == model.tail
        let starred = hex.map(tracking.isFavorite) ?? false
        let following = hex.map { tracking.watching($0, .takeoff) || tracking.watching($0, .land) } ?? false
        return HStack(spacing: WingtipSpace.sm) {
            Button(action: fly) {
                ActionFace(systemImage: WingtipIcon.airplane, title: flying ? "Flying This" : "Fly This")
            }
            .glassProminentButton()
            .disabled(flying)
            .accessibilityLabel(flying ? "Flying this airplane" : "Fly this airplane")
            .accessibilityIdentifier("fly-this-airplane")
            Menu {
                if let hex {
                    Toggle("Tell me when it takes off", isOn: watch(hex, .takeoff))
                    Toggle("Tell me when it lands", isOn: watch(hex, .land))
                }
            } label: {
                ActionFace(systemImage: following ? "bell.fill" : "bell", title: "Follow")
            }
            .glassButton()
            .disabled(hex == nil)
            .accessibilityIdentifier("airplane-follow")
            Toggle(isOn: Binding(get: { starred }, set: { _ in if let kept { tracking.toggleFavorite(kept, undo: undoManager) } })) {
                ActionFace(systemImage: starred ? "\(WingtipIcon.favorite).fill" : WingtipIcon.favorite, title: "Favorite",
                           symbolColour: starred ? Color(uiColor: WingtipColor.Brand.taxiwayYellow) : nil)
            }
            .toggleStyle(.button)
            .glassButton()
            .disabled(kept == nil)
            .accessibilityLabel(starred ? "Remove from Favorites" : "Add to Favorites")
            .accessibilityIdentifier("airplane-favorite")
            ShareLink(item: Config.gateway.appending(path: "/app/plan").appending(queryItems: [URLQueryItem(name: "airplane", value: model.tail)]),
                      subject: Text(model.tail)) {
                ActionFace(systemImage: "square.and.arrow.up", title: "Share")
            }
            .glassButton()
            .accessibilityLabel("Share \(model.tail)")
            .accessibilityIdentifier("airplane-share")
        }
        .glassGroup(spacing: WingtipSpace.sm)
        // Four across the phone, a glyph over a word, to the second
        // accessibility size, where the words would no longer fit.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    private func watch(_ hex: String, _ kind: AirplaneWatch.Kind) -> Binding<Bool> {
        Binding(get: { tracking.watching(hex, kind) }, set: { _ in tracking.toggleWatch(AirplaneWatch(hex: hex, name: model.tail, kind: kind)) })
    }
}

/// The airplane's photo at the card's head, only once Planespotters.net
/// has answered with one, on its terms (docs/legal/credits.md): the
/// photographer's name beside it, the picture and the credit a plain link
/// to its page, its address used as given and never kept. A thumbnail
/// beside the credit, so the tabs stay in sight at half height.
struct AirplanePhotoHead: View {
    let photo: APIAirplanePhoto

    var body: some View {
        if let src = (photo.thumbnailLarge ?? photo.thumbnail).flatMap(URL.init(string:)), let page = URL(string: photo.link) {
            Link(destination: page) {
                HStack(spacing: WingtipSpace.md) {
                    AsyncImage(url: src) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        WingtipInk.inactiveFill
                    }
                    .frame(width: 96, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: WingtipRadius.control, style: .continuous))
                    .accessibilityLabel("The airplane, photographed by \(photo.photographer ?? "a Planespotters.net photographer")")
                    Text("© \(photo.photographer ?? "Photographer") · \(photo.source ?? "Planespotters.net")")
                        .font(WingtipType.note).foregroundStyle(.tint).multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
            }
            .accessibilityIdentifier("airplane-photo")
        }
    }
}
