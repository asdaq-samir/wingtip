# R8's keep rules for what only this app knows of (docs/NATIVE-ANDROID.md,
# "Release build"). The stock proguard-android-optimize.txt keeps every
# class with a native method under its name with those methods
# (-keepclasseswithmembernames ... native <methods>), which is what JNI's
# Java_app_wingtipmaps_android_engine_Engine_callNative and the Packs
# functions are looked up by; each library brings its own rules.

# The JNI shim (src/main/cpp/wingtip_jni.c) finds EngineException by its
# name (FindClass) and throws it through its one-String constructor
# (ThrowNew); nothing in the Kotlin names the constructor, so R8 would
# otherwise rename or drop it and an engine refusal would crash the app.
-keep class app.wingtipmaps.android.engine.EngineException {
    <init>(java.lang.String);
}
