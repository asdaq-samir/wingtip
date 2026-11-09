// The native Android app (docs/NATIVE-ANDROID.md): one module, the app.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
// The JDK the build runs on and compiles with (gradle/gradle-daemon-jvm.properties,
// Java 25, the gateway's LTS), fetched by Gradle from foojay's list where
// the machine has none of its own.
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    // Every dependency from these two, declared here once: a module that
    // named a repository of its own would fail the build.
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "WingtipMaps"
include(":app")
