package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.EndorsementKind;
import java.util.List;

/** One of the student endorsements (EndorsementKind): its code, AC
 *  61-65K's paragraph, the 14 CFR section, its name, and the sample's
 *  words with the blanks the instructor fills. How long one is good for is
 *  the engine's (each endorsement's own `until`). */
public record EndorsementKindDto(
        String code,
        String paragraph,
        String rule,
        String label,
        /** The sample's words, {student} and each field's {key} in them. */
        String template,
        List<EndorsementFieldDto> fields) {

    public static EndorsementKindDto of(EndorsementKind kind) {
        return new EndorsementKindDto(kind.code, kind.paragraph, kind.rule, kind.label, kind.template,
                kind.fields.stream().map(f -> new EndorsementFieldDto(f.key, f.label, f.example, f.required)).toList());
    }
}
