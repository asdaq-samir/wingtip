package app.wingtipmaps.gateway.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import tools.jackson.databind.json.JsonMapper;

/**
 * The gateway's JSON as the apps send and read it, under Jackson 3 and
 * application.yml's settings: what Jackson 3 changed from Jackson 2 that
 * these records were written against.
 */
@JsonTest
class RequestJsonTest {

    private static final Validator VALIDATOR =
            Validation.buildDefaultValidatorFactory().getValidator();

    @Autowired
    private JsonMapper json;

    @Test
    void aLogbookEntryWithItsColumnsLeftOutOrNullReadsAsNone() {
        LogbookEntryRequest entry = json.readValue("""
                {"flownOn": "2026-09-20", "totalHours": 1.2, "nightHours": null, "holding": null}
                """, LogbookEntryRequest.class);
        assertThat(entry.totalHours()).isEqualTo(1.2);
        assertThat(entry.nightHours()).isZero();
        assertThat(entry.dualHours()).isZero();
        assertThat(entry.dayLandings()).isZero();
        assertThat(entry.holding()).isFalse();
        assertThat(VALIDATOR.validate(entry)).isEmpty();
    }

    @Test
    void aVorCheckWithNoErrorIsRefusedRatherThanReadAsZero() {
        VorCheckRequest check = json.readValue("""
                {"checkedOn": "2026-10-01", "kind": "VOT"}
                """, VorCheckRequest.class);
        assertThat(check.errorDeg()).isNull();
        assertThat(VALIDATOR.validate(check))
                .extracting(v -> v.getPropertyPath().toString())
                .containsExactly("errorDeg");
    }

    @Test
    void aTrackPointWithNoPositionIsRefusedRatherThanPutAtZeroZero() {
        TrackPointDto point = json.readValue("""
                {"t": 1}
                """, TrackPointDto.class);
        assertThat(VALIDATOR.validate(point))
                .extracting(v -> v.getPropertyPath().toString())
                .containsExactlyInAnyOrder("lat", "lon");
    }

    @Test
    void datesAndTimesAreWrittenAsTheAppsReadThem() {
        // ISO-8601 strings, as under Jackson 2 with Boot's settings: the
        // apps' generated models parse a date-time string, not a number.
        assertThat(json.writeValueAsString(Instant.parse("2026-11-09T22:20:13.138Z")))
                .isEqualTo("\"2026-11-09T22:20:13.138Z\"");
        assertThat(json.writeValueAsString(LocalDate.of(2026, 9, 20))).isEqualTo("\"2026-09-20\"");
    }

    @Test
    void aFieldTheGatewayDoesNotKnowIsIgnored() {
        // An app built against a newer document may send more.
        MagicLinkRequest ask = json.readValue("""
                {"email": "pilot@example.com", "newer": true}
                """, MagicLinkRequest.class);
        assertThat(ask.email()).isEqualTo("pilot@example.com");
    }
}
