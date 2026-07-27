/*
 * The Android layer.
 *
 * NOT part of the root Gradle build in this repository, and deliberately so:
 * the Android SDK is not installed here (dl.google.com is blocked by the
 * network policy), so `:app` cannot be compiled or assembled in this
 * environment. `:core` is pure Kotlin and DOES build and test, which is why
 * every rule that can lose money lives there rather than here.
 *
 * To build on a machine with the SDK:
 *   1. add `include(":app")` to settings.gradle.kts
 *   2. install SDK platform 35 and build-tools 35.0.0
 *   3. ./gradlew :app:assembleDebug
 */
plugins {
    id("com.android.application") version "8.7.3"
    kotlin("android") version "2.0.21"
}

android {
    namespace = "com.alarmx.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.alarmx.app"
        minSdk = 26          // PRD 8.1
        targetSdk = 35
        versionCode = 1
        versionName = "0.7.0"
        resourceConfigurations += listOf("en", "hi", "bn", "ta")
    }

    buildTypes {
        debug {
            // PRD 18.5. The debug menu exists ONLY in this build type and is
            // compiled out of release, not merely hidden behind a flag.
            buildConfigField("boolean", "DEBUG_MENU", "true")
            applicationIdSuffix = ".debug"
        }
        release {
            buildConfigField("boolean", "DEBUG_MENU", "false")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures { compose = true; buildConfig = true }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":core"))
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.google.android.gms:play-services-ads:23.6.0")
    implementation("com.google.android.play:integrity:1.4.0")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
}
