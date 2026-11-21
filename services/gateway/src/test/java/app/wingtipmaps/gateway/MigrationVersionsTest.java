package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Each Flyway migration has a version of its own. Two branches of one
 * wave each added a V46 (the Apple token's client and the paid-feature
 * table's drop), and Flyway refuses to start on a repeated version, so
 * the merged gateway would not have started at all (the deep security
 * review of 2026-11-21). Read from the source tree, without a database,
 * so the clash fails here in a second rather than at the first boot.
 */
class MigrationVersionsTest {

    private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration");
    private static final Pattern VERSIONED = Pattern.compile("V(\\d+)__.+\\.sql");

    @Test
    void noTwoMigrationsShareAVersion() throws IOException {
        List<String> names;
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            names = files.map(path -> path.getFileName().toString()).toList();
        }
        var versions = names.stream()
                .map(VERSIONED::matcher)
                .filter(Matcher::matches)
                .collect(Collectors.groupingBy(m -> Integer.parseInt(m.group(1)), Collectors.mapping(m -> m.group(0), Collectors.toList())));
        assertThat(versions).isNotEmpty();
        var repeated = versions.values().stream().filter(files -> files.size() > 1).toList();
        assertThat(repeated).as("migrations sharing a version").isEmpty();
    }
}
