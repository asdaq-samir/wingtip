package app.wingtipmaps.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * A caller that is no trusted proxy -- a phone-mode LAN client, the
 * gateway facing the Wi-Fi itself -- writes every forwarded header it
 * likes, and Tomcat ignores them all: it is counted as itself, over plain
 * HTTP, at the host it connected to (RemoteIpTest has the proxy).
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.tomcat.remoteip.internal-proxies=192.0.2.1/32", "app.internal.port=0"})
@Import(RemoteIpEcho.class)
@Testcontainers
class RemoteIpLanTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    @LocalServerPort
    int port;

    @Test
    void aCallersOwnForwardedHeadersAreIgnored() throws Exception {
        assertThat(RemoteIpEcho.ask(port)).isEqualTo("127.0.0.1 false 127.0.0.1 " + port);
    }
}
