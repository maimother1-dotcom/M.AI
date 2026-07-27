rootProject.name = "alarmx"

// `core` is deliberately PURE KOTLIN with no Android dependencies, so the money
// and anti-fraud logic compiles and unit-tests on any JVM without the Android
// SDK. Everything that can lose money lives here. `app` is the Android layer.
include(":core")
