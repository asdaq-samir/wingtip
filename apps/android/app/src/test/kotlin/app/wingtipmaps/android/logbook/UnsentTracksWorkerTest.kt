package app.wingtipmaps.android.logbook

import androidx.work.BackoffPolicy
import androidx.work.NetworkType
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.TimeUnit

/** The unsent tracks' send as WorkManager is asked for it: once there is
 *  a network, and tried again on an exponential backoff from a minute. */
class UnsentTracksWorkerTest {
    private val spec = UnsentTracksWorker.request().workSpec

    @Test
    fun itWaitsForANetwork() {
        assertEquals(NetworkType.CONNECTED, spec.constraints.requiredNetworkType)
    }

    @Test
    fun anUnsentTrackIsTriedAgainOnABackoff() {
        assertEquals(BackoffPolicy.EXPONENTIAL, spec.backoffPolicy)
        assertEquals(TimeUnit.MINUTES.toMillis(1), spec.backoffDelayDuration)
    }

    @Test
    fun itIsThisWorker() {
        assertEquals(UnsentTracksWorker::class.java.name, spec.workerClassName)
    }
}
