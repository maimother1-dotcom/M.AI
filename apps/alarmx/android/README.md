# AlarmX — Android

## What builds here, and what does not

Read this before assuming anything in this directory works.

| Module | State | Verified how |
|---|---|---|
| **`core/`** | **Builds and tests.** Pure Kotlin, zero Android dependencies. | `gradle :core:test` — **78 tests passing** |
| `alarmkit/` | Source **and 13 Robolectric tests written**. Cannot run here. | Nothing. See below. |
| `app/` | **Source only. Does not compile in this repo's environment.** | Nothing. See below. |

`alarmkit/` and `app/` are **excluded from `settings.gradle.kts` on purpose**, so `gradle :core:test` stays honestly green rather than failing for a reason unrelated to the code.

## Can this be run on an emulator?

**No, and not for one reason but three.** All checked rather than assumed:

| Requirement | Result |
|---|---|
| `/dev/kvm` | Absent |
| CPU virtualisation flags (`vmx`/`svm`) | None — an emulator would fall back to full software translation |
| `dl.google.com/android/repository` (SDK, emulator, system images) | HTTP 000, blocked |
| `dl.google.com/dl/android/maven2` (AGP, AndroidX, Compose, Room, Firebase) | HTTP 000, blocked |
| `repo1.maven.org` | HTTP 200, reachable |
| Ubuntu's `android-sdk-platform-23` | Installs, but API 23 — this code needs API 26+ |

So: no emulator, and no way to build an APK to put on one.

### The Robolectric attempt, and why it also failed

Robolectric runs real Android framework code **on the JVM with no emulator and no KVM**, and its `android-all` jars *are* on Maven Central (up to Android 16). That looked like a genuine route, so `alarmkit/` was split out of `app/`: `AlarmScheduler` had its dependencies on app classes replaced with injected `Class<*>` parameters precisely so it could be tested in isolation, and **13 Robolectric tests were written** against it.

It does not run here. Robolectric itself depends on `androidx.test:monitor`, which is published **only** on Google's Maven. Checked: not on Maven Central at any version, and jitpack is blocked too.

**The refactor and the tests are kept, not reverted.** On any machine that can reach `dl.google.com`, add `include(":alarmkit")` to `settings.gradle.kts` and `gradle :alarmkit:test` runs as written. They assert the things that decide whether the alarm rings at all:

- something actually reaches `AlarmManager`
- it uses `setAlarmClock` (Doze-exempt, survives App Standby) rather than a throttleable exact alarm
- the trigger time is exact, and the alarm id travels with the broadcast
- rescheduling one id replaces rather than duplicating, so nobody is woken twice
- cancelling removes it, and cancelling an unset alarm is harmless
- a past trigger time is refused rather than silently never firing
- **without exact-alarm permission it throws instead of pretending the alarm is armed**
- the `PendingIntent` is immutable

### Why `app/` does not build here

The Android SDK is not installed and cannot be installed: `dl.google.com` returns HTTP 403 through this environment's network policy. Without `platform-35` and `build-tools` there is no `android.jar` to compile against and no `aapt2` to package resources.

**Nothing in `app/` has been compiled, linted, run, or tested.** It is reviewed source, not working software. Treat every file in it as a first draft that a compiler has never seen.

To build it on a machine with the SDK:

```bash
# 1. add app to the build
echo 'include(":app")' >> settings.gradle.kts

# 2. SDK platform 35 + build-tools 35.0.0 installed, ANDROID_HOME set

# 3.
./gradlew :app:assembleDebug
```

Expect compile errors on the first pass. Several referenced classes are named but not written — see *What is missing* below.

---

## Why the money logic is in `core/` and not `app/`

Deliberate. `core/` has no Android imports, so it compiles and unit-tests on any JVM. Everything that can lose money lives there and is therefore actually verified:

| File | What it protects |
|---|---|
| `Money.kt` | Integer paise, floored, with a sub-paisa carry. PRD 18.3. |
| `Share.kt` | The 50/55/60/70% ladder, in basis points, no floats. PRD 2. |
| `DayBoundary.kt` | Server-side day rules. Blocks the timezone-farming attack. PRD 18.4. |
| `RewardEngine.kt` | Verification gate, replay protection, alarm gate, daily ceiling. |

The 28 money tests include a randomised property test asserting the engine **never pays more than the entitlement**, across 200 trials of mixed tiers, spin multipliers, fill failures and replays.

## Why the UX logic is in `core/` too

The same reason, applied to the other half of the product. `app/` cannot be compiled here, so anything left in it is unverified by definition. Everything that can be decided without the Android framework was therefore moved out of it, and 50 more tests came with them:

| Package | What it decides | Why it matters |
|---|---|---|
| `oem/` | Per-manufacturer battery-killer walkthrough, keyed off `Build.MANUFACTURER` | **PRD 9, the biggest technical risk in the product.** Redmi, Realme and Vivo kill backgrounded apps outright, and no permission exists to ask for. Get this wrong and the alarm does not ring on most of the target market. |
| `permissions/` | Which permissions block the alarm and which merely degrade it | Exactly two block: exact-alarm and battery exemption. OEM autostart cannot be verified by any API, so it is self-reported and never blocking — treating it otherwise would strand users who have already granted it. |
| `onboarding/` | The step machine | Every step is derived from state, so denying a permission leaves the user *on that step* instead of pushed past it onto a home screen with an alarm that will never ring. |
| `close/` | The Daily Close receipt | Summed from the ledger, never typed. A randomised test asserts receipt equals ledger across 200 trials. |
| `math/` | 5 sets × 4, ad after every 2, three tranches | The tranches are the retention mechanism: three sittings instead of one, so the app is opened three times. |

Two behaviours worth calling out, because both are the opposite of the obvious implementation:

- **A credited view that rounds to zero paise still consumes one of the twenty.** Deriving "credited" from `credited > 0` would hand out a free extra view every time the carry was low.
- **Identity is deferrable.** The alarm needs no account, and asking for a phone number before the user has seen the app work is the largest drop-off in this category. The payout gate still exists; it just sits where the user wants something from us.

**These rules are duplicated in `../backend/src/`, and that duplication is checked.** `backend/test/backend.test.ts` reads these Kotlin files and fails if a share tier, the daily ceiling, the micropaise resolution or the minimum day gap ever diverges. Verified by deliberately changing `STREAK_30` to 6500 and watching the TypeScript test go red.

**The Android copy is advisory.** It exists so the app can render an optimistic figure immediately. The backend decides what the user is actually paid.

---

## What is written in `app/`

The reliability- and security-critical paths, and only those:

- **`../alarmkit/.../AlarmScheduler.kt`** — moved out of `app/` so it can be tested in isolation. `setAlarmClock`, not `setExactAndAllowWhileIdle`. It is the only API the OS treats as a user-visible alarm: exempt from Doze, survives App Standby, visible in the status bar. Checks `canScheduleExactAlarms()` and refuses to pretend an alarm is armed when it is not.
- **`alarm/AlarmRingService.kt`** — foreground service, `USAGE_ALARM` audio so it ignores media volume, wake lock bounded by the five-minute maximum. **Rings until dismissed.** The ten seconds is only the reward window.
- **`alarm/BootReceiver.kt`** + **`RescheduleWorker.kt`** — alarms do not survive a reboot, and phones reboot overnight. Returns `Result.failure()` rather than silently not re-arming.
- **`ui/RingActivity.kt`** — **contains no ad code and never will.** PRD 4.6.
- **`widget/PanchangWidgetProvider.kt`** — RemoteViews only, reads the Room cache, one `AlarmManager` tick at local midnight. Never `updatePeriodMillis`, which floors at 30 minutes.
- **`alarm/AlarmCompletionReporter.kt`** — reports an *event*. Sends no amount, no share tier, no day index, no device clock.
- **`AndroidManifest.xml`** — every permission is load-bearing, `usesCleartextTraffic="false"`, wallet and auth excluded from backup and device transfer.

## What is missing

Named in the source but not written. This list is the honest gap, not a roadmap gesture:

- `ui/MainActivity`, `ui/OnboardingActivity`, `ui/MathActivity`, `ui/CloseActivity`, `ui/WalletActivity`, `ui/TaskViewFactory` (shake / math / QR dismissal UIs)
- `data/AlarmXDatabase`, `data/AlarmDao`, `data/PanchangDao`, the Room entities and migrations
- `AlarmXApi` (the client for `../../backend`), `IntegrityTokenProvider`
- All resources: `strings.xml` in five locales, themes, drawables, launcher icons
- The AdMob rewarded-video integration and its SSV user-id plumbing
- Firebase Auth phone OTP flow
- Any instrumented or UI test

**These are now renderers, not decision-makers.** The state each screen shows comes from `core/`, which is tested. That is the whole reason for the split: it shrinks the uncompiled surface to layout and framework glue.

The panchang precompute job (Swiss Ephemeris, commercial licence) is **out of v1** — PRD 19.3. The widget ships showing next alarm, streak and today's earnings instead.

## Before any of this ships

- **Test on a physical Redmi and a physical Realme.** Emulators do not reproduce OEM battery killers, which are the single biggest technical risk in the product (PRD 9).
- Buy the Swiss Ephemeris Professional licence (PRD 16.7).
- Complete the 60-date panjika cross-check (PRD 16.3).
- Book a human security review (PRD 18.10).
