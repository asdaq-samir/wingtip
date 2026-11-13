package app.wingtipmaps.gateway.config;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

/** AppProperties as the app binds them from application.yml, with the
 *  given keys over it, for a test that starts no application: Boot's own
 *  Binder, so the defaults are the ones the app runs with. The machine's
 *  environment is left out. */
public final class TestAppProperties {

    private TestAppProperties() {}

    /** {@code keysAndValues}: "app.public-base-url", "https://x", ... */
    public static AppProperties with(String... keysAndValues) {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        Map<String, Object> given = new LinkedHashMap<>();
        for (int i = 0; i + 1 < keysAndValues.length; i += 2) {
            given.put(keysAndValues[i], keysAndValues[i + 1]);
        }
        environment.getPropertySources().addFirst(new MapPropertySource("test", given));
        try {
            new YamlPropertySourceLoader()
                    .load("application.yml", new ClassPathResource("application.yml"))
                    .forEach(environment.getPropertySources()::addLast);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
        return Binder.get(environment).bindOrCreate("app", AppProperties.class);
    }
}
