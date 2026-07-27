package com.alarmx.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Fired by AlarmManager. Does as little as possible and hands straight to the
 * foreground service — a BroadcastReceiver has roughly ten seconds before the
 * system kills it, which is not enough to be ringing from.
 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getLongExtra(AlarmScheduler.EXTRA_ALARM_ID, -1L)
        AlarmRingService.start(context, alarmId)
    }
}
