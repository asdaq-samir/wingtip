package app.wingtipmaps.gateway.dto;

import java.util.List;

/** One of the student endorsements, as the engine's endorsement_kinds
 *  gives it through the planner (AC 61-65K's samples are the engine's,
 *  engine/crates/pilot/src/pilot/kinds.rs): its code, AC 61-65K's
 *  paragraph, the 14 CFR section, its name, and the sample's words with
 *  the blanks the instructor fills. How long one is good for is the
 *  engine's too (each endorsement's own `until`). */
public record EndorsementKindDto(
        String code,
        String paragraph,
        String rule,
        String label,
        /** The sample's words, {student} and each field's {key} in them. */
        String template,
        List<EndorsementFieldDto> fields) {}
