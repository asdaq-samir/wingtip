package app.wingtipmaps.android.api

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Where CookieStore keeps its cookies, as one text. */
interface CookieShelf {
    fun read(): String?

    fun write(text: String)
}

/** A text sealed and opened again: null where it no longer opens. */
interface Seal {
    fun seal(plain: String): String

    fun open(sealed: String): String?
}

/**
 * The cookies kept sealed (the security audit's L9, 2026-11-10): the
 * session cookie is the pilot's 30-day sign-in, so it is written to the
 * app's kept store (Kept, the DataStore the "cookies" preferences moved
 * to) encrypted with a key the Android Keystore holds and never
 * lets out (KeystoreSeal), not as plain text. androidx.security's
 * EncryptedSharedPreferences is deprecated (security-crypto 1.1.0, "in
 * favour of existing platform APIs and direct use of Android Keystore",
 * https://developer.android.com/jetpack/androidx/releases/security), so
 * the platform's own Keystore and Cipher are used. A store kept plain
 * before this is read once, sealed and the plain one removed.
 */
class SealedShelf(private val kept: Kept, private val seal: Seal) : CookieShelf {
    override fun read(): String? {
        val read = readFrom(kept[SEALED_KEY], kept[PLAIN_KEY], seal)
        if (read.migrate && read.text != null) write(read.text)
        if (read.migrate) kept.edit { it.remove(PLAIN_KEY) }
        return read.text
    }

    override fun write(text: String) {
        val sealed = seal.seal(text)
        kept.edit { it[SEALED_KEY] = sealed }
    }

    /** What was read, and whether the plain store is to be moved over. */
    data class Read(val text: String?, val migrate: Boolean)

    companion object {
        /** The plain store's key, before L9; the sealed one's. */
        const val PLAIN = "cookies"
        const val SEALED = "cookies.sealed"
        private val PLAIN_KEY = stringPreferencesKey(PLAIN)
        private val SEALED_KEY = stringPreferencesKey(SEALED)

        /** The sealed text where there is one (null where it no longer
         *  opens: signed out, never read as plain); else the plain one,
         *  to be sealed and its plain copy removed. */
        fun readFrom(sealed: String?, plain: String?, seal: Seal): Read = when {
            sealed != null -> Read(seal.open(sealed), migrate = plain != null)
            plain != null -> Read(plain, migrate = true)
            else -> Read(null, migrate = false)
        }
    }
}

/** AES-256 in GCM under a key made in and kept by the Android Keystore;
 *  each text with its own IV, written before it, in Base64. */
class KeystoreSeal(private val alias: String = "wingtip.cookies") : Seal {
    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    override fun seal(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.getEncoder().encodeToString(cipher.iv + cipher.doFinal(plain.toByteArray()))
    }

    override fun open(sealed: String): String? = runCatching {
        val bytes = Base64.getDecoder().decode(sealed)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
        String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES))
    }.getOrNull()

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
