package app.wingtipmaps.gateway.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The picks a saved flight keeps: the planner's address's own keys, the
 *  fuel stops, the fuel on board and the flight rules among them since
 *  round 4's connector audit (M5), and nothing else. */
class SaveFlightPicksTest {

    private static final Validator VALIDATOR =
            Validation.buildDefaultValidatorFactory().getValidator();

    private static boolean valid(String picks) {
        SaveFlightRequest request = new SaveFlightRequest(
                null, "C81", "KMSN", null, null, null, null, null, List.of(), null, null, null, picks);
        return VALIDATOR.validate(request).isEmpty();
    }

    @Test
    void theFuelStopsTheFuelOnBoardAndTheRulesAreKept() {
        assertThat(valid("fuel=KMSN&tanks=C81%3A30%2CKMSN%3A0&rules=ifr")).isTrue();
        assertThat(valid("procs=KMSP%3AI30L%3A%3A%3AL&rules=VFR")).isTrue();
    }

    @Test
    void otherRulesOrKeysAreRefused() {
        assertThat(valid("rules=sometimes")).isFalse();
        assertThat(valid("rules=ifr2")).isFalse();
        assertThat(valid("fuel=KMSN&notes=x")).isFalse();
    }
}
