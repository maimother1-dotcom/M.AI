package com.alarmx.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

/**
 * AlarmManager state does not survive a reboot, and phones reboot overnight.
 * Without this the alarm silently does not fire, which is the failure mode that
 * kills alarm apps. PRD 8.1.
 *
 * Rescheduling reads the database, so it is handed to WorkManager rather than
 * done on the main thread inside a receiver.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            -> WorkManager.getInstance(context)
                .enqueue(OneTimeWorkRequestBuilder<RescheduleWorker>().build())
        }
    }
}
