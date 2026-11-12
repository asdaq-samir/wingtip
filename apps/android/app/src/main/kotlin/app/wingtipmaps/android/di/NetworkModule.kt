package app.wingtipmaps.android.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.Gateway
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
import javax.inject.Singleton

/**
 * The app's one module (Hilt): the OkHttp client, the Retrofit interfaces
 * openapi-generator writes from the servers' OpenAPI documents
 * (api/generated/client, scripts/build/api-models-apps.sh), and the
 * settings' DataStore, each made once. Gateway and Planner, which every
 * screen calls by name, make their interfaces with the same functions
 * here, on their own clients' time limits.
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

    @Provides
    @Singleton
    fun gatewayApi(client: OkHttpClient): GatewayApi = gateway(client)

    @Provides
    @Singleton
    fun plannerApi(client: OkHttpClient): PlannerApi = planner(client)

    @Provides
    @Singleton
    fun assistantApi(client: OkHttpClient): AssistantApi = assistant(client)

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
