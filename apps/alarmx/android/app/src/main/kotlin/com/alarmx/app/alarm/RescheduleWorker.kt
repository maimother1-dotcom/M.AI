package com.alarmx.app.alarm

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.alarmx.app.data.AlarmDao

/** Re-arms every enabled alarm after a reboot or an app update. */
class RescheduleWorker(
    context: Context,
    params: WorkerParameters,
    private val dao: AlarmDao,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val scheduler = AlarmScheduler(applicationContext)
        if (!scheduler.canScheduleExact()) {
            // Do not fail silently. The user must be told the alarm is not armed.
            return Result.failure()
        }
        dao.enabledAlarms().forEach { alarm ->
            scheduler.schedule(alarm.id, alarm.nextTriggerMillis())
        }
        return Result.success()
    }
}
