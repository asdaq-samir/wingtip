import SwiftUI

/// The pilot's personal minimums: the weather they will not take off or
/// land in, each a menu, Off until picked (the web's MinimumsPanel). Kept
/// on this phone; the planner says where the briefing is under them.
struct MinimumsView: View {
    @Environment(Verdict.self) private var verdict

    var body: some View {
        Form {
            Section {
                ForEach(PersonalMinimums.Key.allCases) { key in
                    Picker(key.title, selection: Binding(
                        get: { verdict.minimums[key] },
                        set: { verdict.setMinimum(key, $0) })) {
                            Text("Off").tag(Double?.none)
                            ForEach(key.choices, id: \.self) { value in
                                Text(key.words(value)).tag(Double?.some(value))
                            }
                        }
                        .pickerStyle(.menu)
                }
            }
        }
        .navigationTitle("Personal Minimums")
        .navigationBarTitleDisplayMode(.inline)
    }
}
