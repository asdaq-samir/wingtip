package app.wingtipmaps.gateway.security.mcp;

/** The RFC 8707 resource a request names, compared with the MCP server's. */
final class Resources {

    private Resources() {}

    /** One resource, the MCP server's, without regard to a trailing
     *  slash (the MCP spec's canonical URI has none, and a client may
     *  add one). Several named at once is not a request this server
     *  answers: its tokens are for one audience. */
    static boolean matches(Object asked, String resource) {
        if (asked instanceof String one) {
            return one.replaceAll("/+$", "").equals(resource);
        }
        if (asked instanceof String[] several && several.length == 1) {
            return matches(several[0], resource);
        }
        return false;
    }
}
