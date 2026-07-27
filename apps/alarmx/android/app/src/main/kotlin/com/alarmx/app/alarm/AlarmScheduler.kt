package com.alarmx.app.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

/**
 * Scheduling the alarm so it actually fires. PRD 8.1 and 11.
 *
 * This is the single most important class in the app. An alarm that does not
 * ring on a Redmi is a dead product, and OEM battery managers are the biggest
 * technical risk in the whole thing (PRD 9).
 *
 * Three deliberate choices:
 *
 *  1. `setAlarmClock`, not `setExactAndAllowWhileIdle`. It is the only API the
 *     system treats as a user-visible alarm: it is exempt from Doze, survives
 *     App Standby buckets, and shows in the status bar so the user can see the
 *     alarm is armed. The battery cost is the point, not a regression.
 *
 *  2. A `PendingIntent` per alarm id, so rescheduling replaces rather than
 *     duplicates.
 *
 *  3. Re-armed on boot by [BootReceiver], because `AlarmManager` state does not
 *     survive a restart and a phone that reboots overnight is common.
 */
class AlarmScheduler(private val context: Context) {

    private val manager = context.getSystemService(AlarmManager::class.java)

    /**
     * True when the OS will honour an exact alarm. On Android 12+ the user can
     * revoke this, and if they have, the alarm silently becomes inexact —
     * which for this product means broken. Onboarding must check and route the
     * user to the settings screen rather than assuming.
     */
    fun canScheduleExact(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()

    fun exactAlarmSettingsIntent(): Intent =
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)

    fun schedule(alarmId: Long, triggerAtMillis: Long) {
        require(triggerAtMillis > System.currentTimeMillis()) { "alarm must be in the future" }
        check(canScheduleExact()) { "exact alarm permission is missing — do not pretend it is armed" }

        val fire = PendingIntent.getBroadcast(
            context,
            alarmId.toInt(),
            Intent(context, AlarmReceiver::class.java).putExtra(EXTRA_ALARM_ID, alarmId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // The "show" intent is what the user taps from the status bar clock.
        val show = PendingIntent.getActivity(
            context,
            alarmId.toInt(),
            Intent(context, Class.forName("com.alarmx.app.ui.MainActivity")),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        manager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAtMillis, show), fire)
    }

    fun cancel(alarmId: Long) {
        PendingIntent.getBroadcast(
            context,
            alarmId.toInt(),
            Intent(context, AlarmReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )?.let { manager.cancel(it); it.cancel() }
    }

    companion object {
        const val EXTRA_ALARM_ID = "alarm_id"
    }
}
