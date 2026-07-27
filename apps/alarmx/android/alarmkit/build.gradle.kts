/*
 * The alarm scheduling layer.
 *
 * Split out of `:app` on purpose: it touches the Android framework but nothing
 * else — no resources, no Compose, no androidx, no Firebase. That means it can
 * be compiled against Robolectric's `android-all` jar (which is on Maven
 * Central) and EXECUTED on the JVM, with no Android SDK and no emulator.
 *
 * An alarm that does not fire is a dead product, so this is the code that most
 * needs to be run rather than merely reviewed.
 */
plugins {
    kotlin("jvm") version "2.0.21"
}

repositories { mavenCentral() }

// The PLAIN android-all jar, not the -instrumented one. The instrumented
// variant carries Robolectric's bytecode markers as supertypes, which kotlinc
// cannot resolve; Robolectric loads the instrumented copy itself at runtime.
val androidAll = "org.robolectric:android-all:16-robolectric-13921718"

dependencies {
    compileOnly(androidAll)          // the framework is provided at runtime by Robolectric
    testCompileOnly(androidAll)
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}

kotlin { jvmToolchain(21) }

tasks.test {
    useJUnit()
    systemProperty("robolectric.logging", "stdout")
    testLogging { events("passed", "failed", "skipped"); showStandardStreams = false }
}
