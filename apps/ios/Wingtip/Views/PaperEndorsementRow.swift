import SwiftUI

/// An endorsement signed on paper, recorded here (the student's Training,
/// AC 61-65K): the day it was signed, and for a kind whose words name the
/// make and model (its {mm} field in the engine's endorsement_kinds, as
/// 61.87(n)'s solo and 61.93(c)(2)'s solo cross-country do) the make and
/// model it names, kept with it so 61.93(d)'s checks know the airplane it
/// is good in (V58). The rule under it, and how long
/// it is good for.
struct PaperEndorsementRow: View {
    let kind: EndorsementKind
    let recorded: GWEndorsementDto?
    /// Its day changed or taken off (nil), with the make and model typed.
    let save: (_ day: String?, _ makeModel: String?) -> Void
    @State private var makeModel = ""

    /// The engine's field for the make and model, where its words name one.
    private var field: GWEndorsementFieldDto? { kind.fields.first { $0.key == "mm" } }
    private var typed: String? { makeModel.trimmingCharacters(in: .whitespaces).nonEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            OptionalDayRow(title: kind.label, day: Binding(get: { recorded?.endorsedOn }, set: { save($0, typed) }), upTo: Date())
            if let field {
                TextField(field.label, text: $makeModel, prompt: Text(field.example))
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    // Saved with the day it was signed, once it has one.
                    .onSubmit { if let day = recorded?.endorsedOn { save(day, typed) } }
                    .accessibilityLabel("\(field.label) of \(kind.label)")
            }
            Text(kind.rule).font(.footnote).foregroundStyle(.secondary)
            if let until = recorded?.until { GoodToText(until: until).font(.footnote) }
        }
        .onAppear { makeModel = recorded?.makeModel ?? "" }
    }
}
