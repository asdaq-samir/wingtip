package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Every foreign key's referencing columns lead some index, against the
 * schema Flyway builds in a real Postgres: a key left bare makes each
 * delete of the row it refers to read the whole referring table (V48, the
 * ops audit of 2026-11-21). And the lookups V48 added are there.
 */
class IndexCoverageTest extends AccountTestBase {

    @Test
    void everyForeignKeyLeadsAnIndex() {
        // A key's columns (conkey) are covered when an index on the same
        // table starts with them, in order (indkey's first columns).
        List<String> bare = jdbc.queryForList(
                """
                SELECT c.conrelid::regclass || '(' || c.conname || ')'
                FROM pg_constraint c
                WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
                  AND NOT EXISTS (
                    SELECT 1 FROM pg_index i
                    WHERE i.indrelid = c.conrelid
                      AND array_to_string((i.indkey::int2[])[0:cardinality(c.conkey) - 1], ',')
                        = array_to_string(c.conkey, ','))
                ORDER BY 1
                """,
                String.class);
        // cross_country_reviews' endorsement_id alone:
        // an endorsement is voided, never deleted (AC 120-78B, V26).
        assertThat(bare).allMatch(k -> k.contains("endorsement_id"), "foreign keys with no index: " + bare);
    }

    @Test
    void theLookupsByAddressAndExpiryHaveTheirIndexes() {
        List<String> names = jdbc.queryForList(
                "SELECT indexname FROM pg_indexes WHERE tablename IN ('magic_links', 'flights')", String.class);
        assertThat(names)
                .contains("idx_magic_links_expires", "idx_magic_links_email", "idx_flights_pilot_created", "idx_flights_aircraft")
                .doesNotContain("idx_flights_pilot_id");
    }
}
