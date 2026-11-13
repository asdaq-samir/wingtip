package app.wingtipmaps.android

/**
 * A sign-in link waiting for the pilot's yes (the security audit's M1,
 * 2026-11-10): its token, the address this phone asked a link for (null
 * where it asked none, so the link may be someone else's), and who is
 * signed in now (null for no one), whose session it would replace.
 *
 * The gateway is asked whose link it is before anything is spent (POST
 * /api/auth/magic-link/account, docs/NATIVE-ANDROID.md): `account` is its
 * answer, the address masked ("a•••@icloud.com"), `expired` its 404 (used,
 * expired or unknown alike), `refused` its words where it would not say
 * (a 429), and `checking` while it is asked. Where it cannot be reached,
 * the question falls back to the address this phone asked for.
 */
data class SignInAsk(
    val token: String,
    val address: String?,
    val current: String?,
    val checking: Boolean = false,
    val account: String? = null,
    val expired: Boolean = false,
    val refused: String? = null,
) {
    /** Sign In is offered only for a link that can still sign in. */
    val canSignIn: Boolean get() = !checking && !expired && refused == null

    /** The question, naming the account: the gateway's where it said,
     *  else the one asked for, and the one it replaces. */
    fun question(): String {
        if (expired) return "This sign-in link has expired or was used already. Ask for a new one."
        refused?.let { return it }
        if (checking) return "Checking whose sign-in link this is…"
        val to = when {
            account != null -> "Sign in to Wingtip Maps as $account?"
            address != null -> "Sign in to Wingtip Maps as $address?"
            else -> "Sign in to Wingtip Maps with this link? This phone did not ask for one: go on only if you did."
        }
        val same = current != null && (current.equals(address, ignoreCase = true) || (account != null && masked(current) == account))
        return if (current != null && !same) "$to You will be signed out of $current." else to
    }

    companion object {
        /** An address as the gateway masks it: its first letter and its
         *  domain ("a•••@icloud.com"), to tell the session's own link. */
        fun masked(email: String): String {
            val at = email.indexOf('@')
            if (at < 1) return email
            return email.take(1) + "•••" + email.substring(at)
        }
    }
}
