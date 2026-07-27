rootProject.name = "alarmx"

// `core` is deliberately PURE KOTLIN with no Android dependencies, so the money
// and anti-fraud logic compiles and unit-tests on any JVM without the Android
// SDK. Everything that can lose money lives here.
include(":core")

// NOT INCLUDED, and each for a checked reason:
//
//   :alarmkit  Android framework code (AlarmScheduler) with Robolectric tests
//              written and ready. Robolectric runs the framework on the JVM
//              with no emulator — but it depends on androidx.test, which is
//              published ONLY on Google's Maven. That host is blocked here and
//              androidx.test is not mirrored on Maven Central at any version.
//              Add `include(":alarmkit")` on a machine that can reach
//              dl.google.com and `gradle :alarmkit:test` runs as written.
//
//   :app       The full Android layer. Needs the Android SDK (android.jar for
//              API 35, aapt2) plus AGP, Compose, Room, Firebase and AdMob, all
//              of which live on the same blocked host.
//
// Leaving them out means `gradle :core:test` is green for a real reason.
