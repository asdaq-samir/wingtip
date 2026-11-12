package app.wingtipmaps.android.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.client.apis.AssistantApi
import app.wingtipmaps.android.api.generated.client.apis.GatewayApi
import app.wingtipmaps.android.api.generated.client.apis.PlannerApi
import app.wingtipmaps.android.settings
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.create
import javax.inject.Qualifier
import javax.inject.Singleton

/**
 * The app's one module (Hilt): the OkHttp client, the Retrofit interfaces
 * openapi-generator writes from the servers' OpenAPI documents
 * (api/generated/client, scripts/build/api-models-apps.sh), and the
 * settings' DataStore, each made once: the interfaces are those Gateway
 * and Planner, which every screen calls by name, make with the functions
 * here on their clients' time limits, so the process has one of each.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    /** The app's one OkHttp client: the session's cookies, the cache, the
     *  kept tiles and the CSRF header (Gateway.client). */
    @Provides
    @Singleton
    fun client(@ApplicationContext context: Context): OkHttpClient {
        Gateway.attach(context)
        return Gateway.client
    }

    /** The gateway's calls, the same interface Gateway calls through:
     *  its reads on the client's limit, its writes (`@Writes`), which may
     *  carry a scanned page or a track, on Gateway.WRITE_TIMEOUT_S. */
    @Provides
    fun gatewayApi(@ApplicationContext context: Context): GatewayApi = Gateway.also { it.attach(context) }.api

    @Provides
    @Writes
    fun gatewayWrites(@ApplicationContext context: Context): GatewayApi = Gateway.also { it.attach(context) }.writes

    /** The planner's calls, Planner's own, and those made in the air
     *  (`@InFlight`), which wait no longer than Planner.IN_FLIGHT_MS. */
    @Provides
    fun plannerApi(@ApplicationContext context: Context): PlannerApi = Gateway.attach(context).let { Planner.api }

    @Provides
    @InFlight
    fun plannerInFlight(@ApplicationContext context: Context): PlannerApi = Gateway.attach(context).let { Planner.inFlight }

    @Provides
    fun assistantApi(@ApplicationContext context: Context): AssistantApi = Gateway.attach(context).let { Planner.assistant }

    /** The settings file (Settings.kt), one store a file in a process. */
    @Provides
    fun settings(@ApplicationContext context: Context): DataStore<Preferences> = context.settings

    /** The gateway's own calls, at its root. */
    fun gateway(client: OkHttpClient): GatewayApi = retrofit(Config.gateway + "/", client).create()

    /** The planner's calls, through the gateway's proxy (Config.plannerPath). */
    fun planner(client: OkHttpClient): PlannerApi = retrofit(Config.gateway + Config.plannerPrefix + "/", client).create()

    /** The assistant's calls, which the gateway's proxy sends on to it. */
    fun assistant(client: OkHttpClient): AssistantApi = retrofit(Config.gateway + Config.plannerPrefix + "/", client).create()

    private fun retrofit(base: String, client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(base)
            .client(client)
            .addConverterFactory(Gateway.json.asConverterFactory("application/json".toMediaType()))
            .build()
}

/** The gateway's interface for writes, on the longer limit. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class Writes

/** The planner's interface for the calls made in the air. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class InFlight
