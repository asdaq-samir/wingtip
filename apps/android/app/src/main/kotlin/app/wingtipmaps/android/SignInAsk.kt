package app.wingtipmaps.android

/**
 * A sign-in link waiting for the pilot's yes (the security audit's M1,
 * 2026-11-10): its token, the address this phone asked a link for (null
 * where it asked none, so the link may be someone else's), and who is
 * signed in now (null for no one), whose session it would replace.
 */
data class SignInAsk(val token: String, val address: String?, val current: String?) {
    /** The question, naming the account: the one asked for where there is
     *  one, and the one it replaces. */
    fun question(): String {
        val to = if (address != null) "Sign in to Wingtip Maps as $address?" else "Sign in to Wingtip Maps with this link? This phone did not ask for one: go on only if you did."
        return if (current != null && !current.equals(address, ignoreCase = true)) "$to You will be signed out of $current." else to
    }
}
