import SwiftUI

/// The airport card's head, as the place card of Apple's Maps on iOS 27
/// lays one out (the owner's screenshot of 2026-11-09: a screenshot means
/// ours should show this): the field's picture fading into the card's
/// material, its ident on a tile over the fade, the name large and
/// centred with what and where it is under it, a row of four actions --
/// Fly Here filled, with the flight's time there when it is the plan's
/// destination, Add Stop, Call and Favorite -- and a row of four facts. Every figure is the planner's
/// or the engine's, as sent; none is worked out here.
struct AirportPlaceHead: View {
    @Environment(AirportShelf.self) private var shelf
    let place: AirportPlace
    let photos: AirportPhotos?
    @Binding var shown: ShownPicture?
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(Charts.self) private var charts
    @Environment(\.showPlan) private var showPlan
    @Environment(\.dismiss) private var dismiss
    /// The card at its full height (CardDetent): the picture shows then
    /// alone, as Maps' does, and comes in as the sheet is pulled up.
    @Environment(\.cardExpanded) private var expanded
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.undoManager) private var undoManager
    @Environment(FieldNotams.self) private var notams
    @ScaledMetric(relativeTo: .title) private var tile = 84.0

    var body: some View {
        VStack(spacing: WingtipSpace.md) {
            if expanded {
                picture
                    .frame(height: 220)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    // The picture fades into the card's material, as Maps' does.
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0.55), .init(color: .clear, location: 1)],
                                         startPoint: .top, endPoint: .bottom))
                    .overlay(alignment: .bottom) { identTile.offset(y: tile / 2) }
                    .padding(.bottom, tile / 2)
                    .accessibilityHidden(true)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
            }
            titles
            actions
            let distance = Result { try AirportDistance.of(lat: place.lat, lon: place.lon, ident: place.ident,
                                                           fix: ownShip.fix?.coordinate, departure: plan.course?.departure) }
            // A failure is said under the facts, so the "—" is not read as no distance.
            AirportFacts(place: place, distance: try? distance.get())
            ProblemLine(distance, "The distance").padding(.horizontal, WingtipSpace.lg)
        }
        .padding(.bottom, WingtipSpace.md)
        .padding(.top, expanded ? 0 : WingtipSpace.xl)
        .animation(.default, value: expanded)
    }

    /// The field from the ground, else from the air; with neither, the
    /// chart round the field, never a stock picture.
    @ViewBuilder private var picture: some View {
        if let path = photos?.photo?.url ?? photos?.aerialUrl {
            RemotePicture(path: path)
        } else if let template = charts.template {
            let at = KeepRoute.tile(lat: place.lat, lon: place.lon, zoom: 10)
            AsyncImage(url: template.url(z: at.z, x: at.x, y: at.y)) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                WingtipInk.inactiveFill
            }
        } else {
            WingtipInk.inactiveFill
        }
    }

    /// The field's ident on its own white tile, as Maps' logo tile: the
    /// ident in the sectional's towered blue or untowered magenta (FAA
    /// Chart User's Guide, Airports), its edge in its weather's colour
    /// where it reports (FlightCategory's token colours).
    private var identTile: some View {
        let category = AirportHead.category(place)?.category
        return Text(place.ident)
            .font(.title2.weight(.bold).monospaced())
            .foregroundStyle(Color(uiColor: place.towered ? WingtipColor.Chart.towered : WingtipColor.Chart.untowered))
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            .padding(WingtipSpace.sm)
            .frame(width: tile, height: tile)
            .background(.white, in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous)
                .strokeBorder(category.map { Color(uiColor: FlightCategory.mark($0)) } ?? .clear, lineWidth: 3))
            .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
    }

    private var titles: some View {
        VStack(spacing: WingtipSpace.xs) {
            // The name grows to the hero size with the picture, as Maps'
            // title does at full height; half way it is a card's.
            Text(place.name)
                .font(expanded ? WingtipType.hero : WingtipType.card)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)
                // The UI tests' sign the card is up (WingtipUITests/FlowTests).
                .accessibilityIdentifier("airport-card-head")
                .appEntityIdentifier(SiriSaw.airport(place.ident))
            // What it is and where, a tap from Apple's Maps, as Maps'
            // subtitle opens the place's whereabouts.
            Link(destination: AirportCard.mapsLink(place)) {
                HStack(spacing: WingtipSpace.xxs) {
                    Text(Self.subtitle(place))
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            .accessibilityHint("Opens it in Maps")
            // Its elevation, and the airspace it lies in.
            let facts = [place.elevationFt.map { "Elev \(Format.altitude($0))" }, place.airspaceClass.map { "Class \($0)" }].compactMap { $0 }
            if !facts.isEmpty {
                Text(facts.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                    .accessibilityLabel([place.elevationFt.map { "elevation \(SpokenFigures.feet($0))" }, place.airspaceClass.map { "Class \($0)" }]
                        .compactMap { $0 }.joined(separator: ", "))
            }
            // Closed, from NASR (decision 0043), then who may land here and
            // how far its figures are to be trusted, each the engine's words.
            if let closed = place.closed {
                Text(closed).font(.subheadline.weight(.semibold)).foregroundStyle(WingtipInk.problem)
                    .accessibilityIdentifier("airport-card-closed")
            }
            let use = Result { try Engine.airportUseWords(private: place.isPrivate, military: place.military) }
            if let words = try? use.get().words {
                Text(words).font(.subheadline).foregroundStyle(WingtipInk.caution).accessibilityIdentifier("airport-card-use")
            }
            ProblemLine(use, "Who may land here")
            let data = Result { try Engine.airportDataWords(dataSource: place.dataSource, infoDate: place.infoDate) }
            if let words = try? data.get() { Text(words).font(.subheadline).foregroundStyle(.secondary) }
            ProblemLine(data, "Where its figures come from")
            // A NOTAM in force that closes the field, or a TFR near it, its
            // badge under the name, a tap opening it (the owner, 2026-11-11:
            // "tapping the affected thing should show the notam").
            if let mark = notams.marks.field {
                Button { notams.opened = mark.open } label: { NotamMarkBadge(mark: mark) }
                    .buttonStyle(.plain)
                    .hitArea()
                    .accessibilityHint("Opens its NOTAM")
            }
            KeptAgeLine(kind: .airports, key: place.ident)
        }
        .padding(.horizontal, WingtipSpace.lg)
    }

    /// "Towered airport · Oshkosh, WI": the field's kind and its town.
    static func subtitle(_ place: AirportPlace) -> String {
        let region = place.region.map { $0.hasPrefix("US-") ? String($0.dropFirst(3)) : $0 }
        let town = [place.municipality, region].compactMap { $0 }.joined(separator: ", ")
        let kind = place.towered ? "Towered airport" : "Non-towered airport"
        return town.isEmpty ? kind : "\(kind) · \(town)"
    }

    /// Four equal actions and no more, the first filled, as the web's
    /// (PlaceActions; the owner, 2026-11-11: "fly here, add stop, call and
    /// address ... no need for other buttons", Favorite in Address's place
    /// since): Fly Here (the time there, the planner's, when this is the
    /// plan's destination), Add Stop (greyed where it can't be one), Call
    /// (the FAA's phone for the field, greyed where it lists none) and
    /// Favorite. Depart From is in the foot's Add to Plan, the diagram the
    /// first picture tile. A field NASR lists as closed is never offered
    /// to land at (decision 0043): Fly Here and Add Stop are greyed.
    private var actions: some View {
        let here = plan.dest == place.ident
        let ete = here ? plan.totals?.eteMin.map(Format.duration) : nil
        let call = place.phone.flatMap { URL(string: "tel:" + $0.filter { !$0.isWhitespace }) }
        let kept = shelf.isFavorite(place.ident)
        return HStack(spacing: WingtipSpace.sm) {
            Button { Task { await plan.flyHere(place.ident, near: ownShip.fix); done() } } label: {
                ActionFace(systemImage: CardAction.flyHere.systemImage, title: ete ?? CardAction.flyHere.title)
            }
            .glassProminentButton()
            .disabled(place.closed != nil)
            .accessibilityLabel(ete.map { "Fly Here, \($0)" } ?? "Fly Here")
            .accessibilityIdentifier("fly-here")
            Button { plan.addStop(place.ident); done() } label: {
                ActionFace(systemImage: CardAction.addStop.systemImage, title: "Add Stop")
            }
            .glassButton()
            .disabled(place.closed != nil || !plan.canAddStop(place.ident))
            .accessibilityLabel(plan.canAddStop(place.ident) ? CardAction.addStop.title : "\(CardAction.addStop.title): already on the route")
            .accessibilityIdentifier("place-add-stop")
            Group {
                let face = ActionFace(systemImage: CardAction.call.systemImage, title: CardAction.call.title)
                if let call { Link(destination: call) { face } } else { Button {} label: { face }.disabled(true) }
            }
            .glassButton()
            .accessibilityLabel(place.phone.map { "Call \($0)" } ?? "Call: no phone listed")
            .accessibilityIdentifier("place-call")
            Toggle(isOn: Binding(get: { kept }, set: { _ in shelf.toggleFavorite(KeptAirport(place), undo: undoManager) })) {
                ActionFace(systemImage: kept ? "\(WingtipIcon.favorite).fill" : WingtipIcon.favorite, title: CardAction.favorite.title,
                           symbolColour: kept ? Color(uiColor: WingtipColor.Brand.taxiwayYellow) : nil)
            }
            .toggleStyle(.button)
            .glassButton()
            .accessibilityLabel(kept ? "Remove from Favorites" : "Add to Favorites")
            .accessibilityIdentifier("place-favorite")
        }
        .glassGroup(spacing: WingtipSpace.sm)
        .padding(.horizontal, WingtipSpace.lg)
        // Four across the phone, a glyph over a word, to the second
        // accessibility size, where the words would no longer fit.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    /// The card put away where it is a sheet, and the plan shown.
    private func done() {
        if let showPlan { showPlan() } else { dismiss() }
    }
}

/// An action's face, as Maps draws one: the glyph over its word, the
/// button's whole width.
struct ActionFace: View {
    let systemImage: String
    let title: String
    /// The glyph's own colour, where it says a state (a Favorite's star).
    var symbolColour: Color?

    var body: some View {
        VStack(spacing: WingtipSpace.xxs) {
            Image(systemName: systemImage).font(.title3).foregroundStyle(symbolColour.map(AnyShapeStyle.init) ?? AnyShapeStyle(.foreground))
            Text(title).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 52)
    }
}

/// The field's four facts, label over value, as Maps' facts row: its
/// weather's category in its colour (≈ where it is not the field's own),
/// the wind reported, its longest runway and how far it is (from the
/// airplane, else from the departure: AirportDistance).
struct AirportFacts: View {
    let place: AirportPlace
    let distance: AirportDistance?

    var body: some View {
        let chip = AirportHead.category(place)
        let metar = place.metar
        let wind = metar.flatMap { $0.windSpeedKt != nil || $0.windDirTrueDeg != nil ? $0 : nil }
        let longest = place.runways.compactMap(\.lengthFt).max()
        FactsRow(facts: [
            .init(label: "Weather", value: chip.map { ($0.own ? "" : "≈") + $0.category } ?? "—",
                  spoken: chip.map { $0.own ? SpokenFigures.flightCategory($0.category) : "about \(SpokenFigures.flightCategory($0.category))" },
                  colour: chip.map { Color(uiColor: FlightCategory.words($0.category)) }),
            .init(label: "Wind", value: wind.map { AirportWords.windLine(dirTrueDeg: $0.windDirTrueDeg, speedKt: $0.windSpeedKt, gustKt: $0.windGustKt) } ?? "—"),
            .init(label: "Longest", value: longest.map { Format.altitude(Double($0)) } ?? "—",
                  spoken: longest.map { "longest runway \(SpokenFigures.feet(Double($0)))" }),
            .init(label: distance?.caption ?? "Distance", value: distance.map { Format.distance($0.nm, decimals: 0) } ?? "—", spoken: distance?.spoken),
        ])
        .padding(.horizontal, WingtipSpace.lg)
    }
}

extension EnvironmentValues {
    /// Whether a card is at its full height: its sheet at the large
    /// detent (CardHost), or a card with no
    /// detents (the iPad's inspector, a page pushed), which is always.
    @Entry var cardExpanded = true
}

/// What the card's head says of a field's weather: its colour -- its own
/// report's, or with none the modelled one or a near station's, marked
/// "≈".
enum AirportHead {
    /// The category the chip shows, and whether it is the field's own.
    static func category(_ place: AirportPlace) -> (category: String, own: Bool)? {
        if let own = place.metar?.flightCategory { return (own, true) }
        if place.metar == nil, let modelled = place.modelledWeather?.flightCategory { return (modelled, false) }
        if place.metar == nil, let near = place.nearbyMetar, near.near, let category = near.metar.flightCategory { return (category, false) }
        return nil
    }
}
