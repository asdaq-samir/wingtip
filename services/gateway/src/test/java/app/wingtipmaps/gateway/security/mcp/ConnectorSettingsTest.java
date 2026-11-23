package app.wingtipmaps.gateway.security.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

/** The connector on needs the planner's secret; off, it needs nothing. */
class ConnectorSettingsTest {

    private static ConnectorSettings settings(boolean enabled, String internalToken) {
        return new ConnectorSettings(enabled, "", "", List.of(), "", internalToken);
    }

    @Test
    void onWithoutTheInternalTokenWillNotStart() {
        assertThatThrownBy(() -> settings(true, " "))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MCP_INTERNAL_TOKEN");
        assertThat(settings(true, "a-long-random-secret-of-32-or-more").enabled())
                .isTrue();
    }

    @Test
    void onWithAShortInternalTokenWillNotStart() {
        assertThatThrownBy(() -> settings(true, "x".repeat(ConnectorSettings.MIN_INTERNAL_TOKEN - 1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("shorter than 32");
        assertThat(settings(true, "x".repeat(ConnectorSettings.MIN_INTERNAL_TOKEN))
                        .enabled())
                .isTrue();
    }

    /** The wider write has a name of its own, so a consent given to the
     *  old wingtip:write ("Save flights" alone) grants none of it, and
     *  Connected Apps says nothing of the old scope (L4). */
    @Test
    void theOldWriteScopeGrantsNothingAndTheNewOneIsSaidInPlainWords() {
        assertThat(ConnectorSettings.SCOPES).containsExactly("wingtip:read", "wingtip:flights");
        assertThat(ConnectorSettings.wordsOf("wingtip:read wingtip:write"))
                .containsExactly("Read your airplanes and saved flights, and plan with them");
        assertThat(ConnectorSettings.wordsOf("wingtip:read,wingtip:flights"))
                .containsExactly(
                        "Read your airplanes and saved flights, and plan with them",
                        "Save, change and delete your saved flights");
    }

    @Test
    void offNeedsNoToken() {
        assertThat(settings(false, "").enabled()).isFalse();
    }
}
