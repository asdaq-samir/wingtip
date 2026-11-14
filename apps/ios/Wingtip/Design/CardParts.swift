import SwiftUI

/// The parts a thing's card is laid out with after Apple Maps' place card
/// (the owner's C1, 2026-11-14: "How can we make our airport card more
/// similar to this? Can tabs be similar to that floating buttons group at
/// the bottom?", then for the airplane cards "make sure the airplane card
/// looks similar to airport card"; docs/design/rules.md §2): under the
/// actions a sideways strip of facts, then the pictures as large rounded
/// tiles, then the tab's page, its tabs in the floating glass bar at the
/// card's foot. The web's CardFacts, CardPictures and CardTabBar; each
/// card gives its own facts, pictures and tabs.

/// A card's facts in a row that scrolls sideways, as Maps' Hours, Accepts
/// and Distance: each a grey name over its value (`FactCell`), only where
/// the card's data has it. A sideways drag is the row's, never the sheet's.
struct FactStrip<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: WingtipSpace.xl) { content }
                .padding(.horizontal, WingtipSpace.lg)
        }
        .scrollClipDisabled()
    }
}

/// One fact: its name small and grey over its value, which may be a badge.
/// `spoken` is what VoiceOver says of a shorthand value.
struct FactCell<Value: View>: View {
    let label: String
    var spoken: String?
    @ViewBuilder let value: Value

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            value.font(.headline.monospacedDigit()).lineLimit(1)
        }
        .accessibilityElement(children: spoken == nil ? .combine : .ignore)
        .accessibilityLabel(spoken.map { "\(label): \($0)" } ?? "")
    }
}

extension FactCell where Value == Text {
    /// A fact in plain words, "Elevation" over "1,428 ft".
    init(_ label: String, _ value: String, spoken: String? = nil, colour: Color? = nil) {
        self.label = label
        self.spoken = spoken
        self.value = Text(value).foregroundStyle(colour ?? .primary)
    }
}

/// The card's pictures, large rounded tiles in a row that pages sideways
/// as Maps' photos do, a flick coming to rest on a tile. One height
/// whatever it holds, so nothing under it moves as a picture arrives (the
/// web's CardPictures, the flicker audit).
struct PictureStrip<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: WingtipSpace.md) { content }
                .scrollTargetLayout()
                .padding(.horizontal, WingtipSpace.lg)
        }
        .scrollTargetBehavior(.viewAligned)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
}

/// One picture tile: the picture filling a rounded tile, its caption over
/// it, a tap opening it full screen (or its page).
struct PictureTile<Picture: View>: View {
    let caption: String
    /// What VoiceOver says the tap does: "KDLH from the air, full screen".
    let label: String
    let action: () -> Void
    @ViewBuilder let picture: Picture
    @ScaledMetric(relativeTo: .title3) private var height = 180.0

    var body: some View {
        Button(action: action) {
            picture
                .frame(width: height * 4 / 3, height: height)
                .clipped()
                .overlay(alignment: .bottomLeading) {
                    Text(caption)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.6), radius: 3)
                        .padding(WingtipSpace.md)
                }
                .clipShape(RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// A card's tabs in the floating glass bar at its foot, as Maps' place card
/// has its group of buttons: the system's bottom toolbar, Liquid Glass on
/// iOS 26, holding the stock tabs picker, the picked tab in the look's
/// tint. In reach at every height, out of sight at the pill, where the
/// card is its title row alone (card rule 10).
struct CardTabBar<Tab: Hashable>: ToolbarContent {
    struct Item {
        let tab: Tab
        let title: String
        /// Why to open it, said with its name for VoiceOver ("Weather, MVFR")
        /// and shown beside it where it is a count ("Charts 9").
        var hint: String?
        var shown: Bool = false
    }

    @Binding var tab: Tab
    let items: [Item]
    let atPill: Bool
    let accent: Color

    var body: some ToolbarContent {
        if !atPill {
            ToolbarItem(placement: .bottomBar) {
                Picker("Section", selection: $tab) {
                    ForEach(items, id: \.tab) { item in
                        Text(item.shown && item.hint != nil ? "\(item.title) \(item.hint!)" : item.title)
                            .accessibilityLabel(item.hint.map { "\(item.title), \($0)" } ?? item.title)
                            .tag(item.tab)
                    }
                }
                .tabsPicker()
                .tint(accent)
                .accessibilityIdentifier("card-tab-bar")
            }
        }
    }
}

extension EnvironmentValues {
    /// Whether the card is down at its pill (CardHost), where only its
    /// title row shows and its tab bar is put away.
    @Entry var cardAtPill = false
}
