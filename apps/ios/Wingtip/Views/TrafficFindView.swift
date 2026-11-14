import SwiftUI

/// An airplane found by what a pilot knows it by -- its callsign
/// (UAL2088), registration (N174HA) or ICAO address -- anywhere in
/// adsb.lol's coverage, as the web app's Aircraft card finds one; before
/// anything is typed, the Favorites and the Recents. A tap opens its card
/// and tracks it.
struct TrafficFindView: View {
    @Environment(Tracking.self) private var tracking
    @Environment(Navigator.self) private var nav
    @Environment(Traffic.self) private var traffic
    @Environment(OwnShip.self) private var ownShip
    @State private var typed = ""
    @State private var found: TrafficFound?
    @State private var asked = ""
    @State private var failed = false
    /// Moved on by a submit or a pull, so the same text is asked again at
    /// once; askedTurn is the turn the last search began on.
    @State private var turn = 0
    @State private var askedTurn = 0

    /// adsb.lol answers one request every few seconds from the planner's
    /// address: a search it could not be asked for yet is asked again,
    /// past the planner's fifteen-second wait, three times at most.
    static let retries = 3
    static let retryEvery: Duration = .seconds(6)

    private var wanted: String { typed.filter { !$0.isWhitespace }.uppercased() }

    /// Whether an airplane's callsign, registration or address begins with
    /// what is typed (a registration's hyphen aside).
    static func named(_ plane: TrafficAircraft, _ text: String) -> Bool {
        let bare = text.replacingOccurrences(of: "-", with: "")
        return (plane.callsign ?? "").uppercased().hasPrefix(text)
            || (plane.registration ?? "").replacingOccurrences(of: "-", with: "").uppercased().hasPrefix(bare)
            || plane.hex.uppercased().hasPrefix(text)
    }

    /// The airplanes on the map whose name begins with it, before adsb.lol's
    /// answer for the rest; then that answer's, eight at most.
    private var listed: [TrafficAircraft] {
        guard wanted.count >= 3 else { return [] }
        let heard = traffic.planes.filter { Self.named($0, wanted) }
        let more = (asked == wanted ? found?.aircraft ?? [] : []).filter { plane in !heard.contains { $0.hex == plane.hex } }
        return Array((heard + more).prefix(8))
    }

    var body: some View {
        List {
            if wanted.count >= 3 {
                Section {
                    ForEach(listed, id: \.hex) { plane in
                        Button { open(plane.hex, plane: plane) } label: { AirplaneRow(plane: plane) }
                            .foregroundStyle(.primary)
                    }
                    if listed.isEmpty, asked == wanted, let record = found?.registered {
                        // None in the air by that name: the FAA's record,
                        // its card opened all the same.
                        Button {
                            if let hex = record.modeSHex { open(hex.lowercased(), plane: nil) }
                        } label: {
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(record.nNumber).font(.headline)
                                Text([[record.manufacturer, record.model].compactMap { $0 }.joined(separator: " ").nonEmpty,
                                      found?.checked == false ? "not yet known whether it is flying" : "not in the air now"]
                                        .compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                        .foregroundStyle(.primary)
                        .disabled(record.modeSHex == nil)
                    } else if listed.isEmpty, asked == wanted, found != nil, found?.checked != false {
                        Text("None in the air by that name is heard now").foregroundStyle(.secondary)
                    }
                    if asked == wanted, found?.checked == false {
                        Text("adsb.lol is busy; asking again…").font(.footnote).foregroundStyle(.secondary)
                    }
                    if failed, asked == wanted {
                        Text("Couldn't search. Try again in a moment.").font(.footnote).foregroundStyle(WingtipInk.problem)
                    } else if asked != wanted || found == nil, listed.isEmpty {
                        ForEach(0..<2, id: \.self) { _ in
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text("N-number").font(.headline)
                                Text("Maker and model · in the air or not").font(.footnote).foregroundStyle(.secondary)
                            }
                            .loading("Fetching \(wanted)")
                        }
                    }
                } header: {
                    Text("Found")
                } footer: {
                    // Whose data answered, as the map credits what it draws.
                    if asked == wanted, found?.aircraft.isEmpty == false, let source = found?.source { Text(Traffic.credit(source)) }
                }
            } else {
                if !tracking.favorites.isEmpty {
                    Section("Favorites") {
                        ForEach(tracking.favorites) { kept in
                            Button { open(kept.hex, plane: nil) } label: { KeptRow(kept: kept) }.foregroundStyle(.primary)
                        }
                    }
                }
                Section("Recents") {
                    if tracking.recents.isEmpty {
                        Text("None yet: the airplanes opened are kept here.").foregroundStyle(.secondary)
                    }
                    ForEach(tracking.recents) { kept in
                        Button { open(kept.hex, plane: nil) } label: { KeptRow(kept: kept) }.foregroundStyle(.primary)
                    }
                    .onDelete { at in
                        for hex in at.map({ tracking.recents[$0].hex }) { tracking.forget(recent: hex) }
                    }
                }
            }
        }
        .navigationTitle("Find an airplane")
        .searchable(text: $typed, prompt: "Callsign, N-number or address")
        .textInputAutocapitalization(.characters)
        .autocorrectionDisabled()
        .onSubmit(of: .search) {
            if let first = listed.first { open(first.hex, plane: first) } else { turn += 1 }
        }
        // SwiftUI's own debounce: the task is cancelled and begun again
        // each time the text (or the turn) changes, and when the view goes.
        .task(id: Asking(text: wanted, turn: turn)) { await search(wanted) }
    }

    /// Asked once the typing pauses, half a second, or at once on a submit
    /// or a pull: each search is a request adsb.lol paces.
    private func search(_ text: String) async {
        let now = turn != askedTurn
        askedTurn = turn
        guard text.count >= 3 else { return }
        do {
            if !now { try await Task.sleep(for: .milliseconds(500)) }
            for attempt in 0...Self.retries {
                let answer = try await Planner.findTraffic(text)
                guard !Task.isCancelled else { return }
                found = answer
                asked = text
                failed = false
                if answer.checked != false { return }
                if attempt < Self.retries { try await Task.sleep(for: Self.retryEvery) }
            }
        } catch {
            guard !Task.isCancelled else { return }
            asked = text
            failed = true
        }
    }

    private func open(_ hex: String, plane: TrafficAircraft?) {
        tracking.track(hex, plane: plane)
        nav.open(.traffic(hex.lowercased()))
    }
}

/// What the find task is keyed on: the text and the turn.
private struct Asking: Equatable {
    let text: String
    let turn: Int
}

struct KeptRow: View {
    let kept: KeptAirplane

    var body: some View {
        HStack {
            Image(systemName: "airplane").foregroundStyle(.tint).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(kept.name).font(.headline)
                if let type = kept.type { Text(type).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview("TrafficFindView") {
    NavigationStack { TrafficFindView() }
        .environment(Traffic())
        .environment(OwnShip())
}

#Preview("KeptRow") {
    List {
        KeptRow(kept: KeptAirplane(hex: "a1b2c3", name: "N174HA", type: "C172"))
        KeptRow(kept: KeptAirplane(hex: "a93f1e", name: "UAL2088"))
    }
}
