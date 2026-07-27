package com.alarmx.alarm

import android.app.AlarmManager
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The alarm actually being scheduled, executed against the real Android
 * framework on the JVM. No emulator, no Android SDK: Robolectric supplies the
 * framework classes and shadows the system services.
 *
 * This is the one class in the app where being wrong means the alarm silently
 * does not ring, which is a dead product. So it gets run, not just reviewed.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AlarmSchedulerTest {

    class TestReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = Unit
    }

    class TestActivity : Activity()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val alarmManager get() = context.getSystemService(AlarmManager::class.java)
    private val scheduler get() =
        AlarmScheduler(context, TestActivity::class.java, TestReceiver::class.java)

    private fun inOneHour() = System.currentTimeMillis() + 3_600_000L

    @Test
    fun `an alarm is actually registered with the system`() {
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())

        val scheduled = shadowOf(alarmManager).scheduledAlarms
        assertEquals(1, scheduled.size, "nothing reached AlarmManager")
    }

    /**
     * setAlarmClock is the ONLY API the system treats as a user-visible alarm:
     * exempt from Doze, survives App Standby buckets, shown in the status bar.
     * setExactAndAllowWhileIdle is throttled and would make the alarm
     * unreliable on exactly the budget devices this product targets.
     */
    @Test
    fun `it uses setAlarmClock, not a throttleable exact alarm`() {
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())

        val info = alarmManager.nextAlarmClock
        assertNotNull(info, "no AlarmClockInfo — this is NOT a user-visible alarm")
        assertNotNull(info.showIntent, "no show intent, so the status bar chip does nothing")
    }

    @Test
    fun `the alarm fires at the requested time, not approximately`() {
        val at = inOneHour()
        scheduler.schedule(alarmId = 7L, triggerAtMillis = at)

        val scheduled = shadowOf(alarmManager).scheduledAlarms.single()
        assertEquals(at, scheduled.triggerAtTime)
    }

    @Test
    fun `the alarm id travels with the broadcast so the right alarm rings`() {
        scheduler.schedule(alarmId = 42L, triggerAtMillis = inOneHour())

        val pending = shadowOf(alarmManager).scheduledAlarms.single().operation
        val intent = shadowOf(pending).savedIntent
        assertEquals(42L, intent.getLongExtra(AlarmScheduler.EXTRA_ALARM_ID, -1L))
        assertEquals(TestReceiver::class.java.name, intent.component?.className)
    }

    @Test
    fun `rescheduling the same id replaces rather than duplicating`() {
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour() + 60_000L)

        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size,
            "two alarms for one id means the user gets woken twice")
    }

    @Test
    fun `different ids schedule independently`() {
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())
        scheduler.schedule(alarmId = 2L, triggerAtMillis = inOneHour() + 60_000L)

        assertEquals(2, shadowOf(alarmManager).scheduledAlarms.size)
    }

    @Test
    fun `cancelling removes the alarm from the system`() {
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())
        scheduler.cancel(alarmId = 1L)

        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
        assertNull(alarmManager.nextAlarmClock)
    }

    @Test
    fun `cancelling an alarm that was never set is harmless`() {
        scheduler.cancel(alarmId = 999L)   // must not throw
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun `scheduling in the past is refused rather than silently never firing`() {
        assertFailsWith<IllegalArgumentException> {
            scheduler.schedule(alarmId = 1L, triggerAtMillis = System.currentTimeMillis() - 1000)
        }
    }

    /**
     * On Android 12+ the user can revoke exact-alarm permission, and if they
     * have, the alarm silently degrades to inexact — which for this product
     * means broken. It must fail loudly so onboarding can route the user to
     * the settings screen instead of claiming the alarm is armed.
     */
    @Test
    fun `it refuses to pretend an alarm is armed without exact-alarm permission`() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        shadowOf(alarmManager).setCanScheduleExactAlarms(false)

        assertFailsWith<IllegalStateException> {
            scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())
        }
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty(),
            "nothing may be scheduled when the permission is missing")
    }

    @Test
    fun `canScheduleExact reflects the real system state`() {
        shadowOf(alarmManager).setCanScheduleExactAlarms(false)
        assertTrue(!scheduler.canScheduleExact())
        shadowOf(alarmManager).setCanScheduleExactAlarms(true)
        assertTrue(scheduler.canScheduleExact())
    }

    @Test
    fun `it hands the user a real settings screen to fix the permission`() {
        val intent = scheduler.exactAlarmSettingsIntent()
        assertEquals(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, intent.action)
    }

    /** PendingIntents that touch money or alarms must be immutable. */
    @Test
    fun `the pending intent is immutable`() {
        scheduler.schedule(alarmId = 1L, triggerAtMillis = inOneHour())
        val pending = shadowOf(alarmManager).scheduledAlarms.single().operation
        assertTrue(shadowOf(pending).isBroadcastIntent)
        assertTrue(
            shadowOf(pending).flags and android.app.PendingIntent.FLAG_IMMUTABLE != 0,
            "a mutable PendingIntent lets another app rewrite the alarm intent",
        )
    }
}
