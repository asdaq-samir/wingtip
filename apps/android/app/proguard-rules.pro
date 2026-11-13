# R8's keep rules for what only this app knows of (docs/NATIVE-ANDROID.md,
# "Release build"); each library brings its own rules, but JNA's Android
# archive brings none.

# The engine's generated Kotlin (engine/bindings/ffi, uniffi-bindgen)
# reaches its library through JNA, which finds each native function by
# the name of a method of an interface extending Library, reads each
# Structure's fields by their names, and calls back into its own classes
# from its native part: the rules UniFFI's manual gives for Android, so
# R8 neither renames nor drops any of them.
-dontwarn java.awt.*
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.** { public *; }
-keep class app.wingtipmaps.android.engine.ffi.** { *; }
