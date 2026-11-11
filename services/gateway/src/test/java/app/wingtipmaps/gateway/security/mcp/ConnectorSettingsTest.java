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
        assertThat(settings(true, "a-long-random-secret").enabled()).isTrue();
    }

    @Test
    void offNeedsNoToken() {
        assertThat(settings(false, "").enabled()).isFalse();
    }
}
