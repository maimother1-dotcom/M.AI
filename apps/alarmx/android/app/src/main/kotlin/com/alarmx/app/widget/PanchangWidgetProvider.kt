package com.alarmx.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.alarmx.app.R
import com.alarmx.app.data.PanchangCache
import com.alarmx.app.ui.CalendarActivity
import com.alarmx.app.ui.MainActivity
import java.util.Calendar

/**
 * The 4x2 home-screen widget. PRD 16.4.
 *
 * The mechanic: the calendar is the reason to look, AlarmX state is what the
 * user sees while looking. No notification needed, no rupees spent.
 *
 * Two things this deliberately does NOT do:
 *
 *  * It never computes panchang. It reads the precomputed Room cache (PRD
 *    16.1), because doing astronomy on a budget phone every update is exactly
 *    the battery cost this design exists to avoid.
 *  * It never uses `updatePeriodMillis`. The content changes once a day, so it
 *    is refreshed by an AlarmManager tick at local midnight. `updatePeriodMillis`
 *    floors at 30 minutes and would wake the device 48 times a day for nothing.
 */
class PanchangWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { render(context, manager, it) }
        scheduleMidnightTick(context)
    }

    override fun onEnabled(context: Context) = scheduleMidnightTick(context)

    override fun onDisabled(context: Context) {
        midnightPendingIntent(context)?.let {
            context.getSystemService(AlarmManager::class.java).cancel(it)
        }
    }

    private fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val today = PanchangCache.get(context).today()
        val state = PanchangCache.get(context).alarmxState()

        val views = RemoteViews(context.packageName, R.layout.widget_panchang_4x2).apply {
            setTextViewText(R.id.widget_clock, state.nextAlarmTime)
            setTextViewText(R.id.widget_gregorian, today.gregorian)
            setTextViewText(R.id.widget_native_date, today.nativeDate)
            setTextViewText(
                R.id.widget_panchang,
                listOfNotNull(
                    "${today.tithi} · ${today.nakshatra}",
                    today.festival,
                ).joinToString("\n"),
            )
            setTextViewText(R.id.widget_next_alarm, state.nextAlarmTime)
            setTextViewText(R.id.widget_share, "${state.sharePercent}%")
            setTextViewText(R.id.widget_exam, state.examCountdown ?: "${state.streakDays}d")

            // Two tap targets, two PendingIntents. PRD 16.4.
            setOnClickPendingIntent(R.id.widget_calendar_half, activity(context, CalendarActivity::class.java, 1))
            setOnClickPendingIntent(R.id.widget_alarmx_half, activity(context, MainActivity::class.java, 2))
        }
        manager.updateAppWidget(widgetId, views)
    }

    private fun activity(context: Context, cls: Class<*>, requestCode: Int): PendingIntent =
        PendingIntent.getActivity(
            context, requestCode, Intent(context, cls),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    /** One wake-up a day, at the user's local midnight. Nothing more. */
    private fun scheduleMidnightTick(context: Context) {
        val next = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 5)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        val pi = PendingIntent.getBroadcast(
            context, MIDNIGHT_REQUEST,
            Intent(context, PanchangWidgetProvider::class.java)
                .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_IDS,
                    AppWidgetManager.getInstance(context).getAppWidgetIds(
                        ComponentName(context, PanchangWidgetProvider::class.java),
                    ),
                ),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // Inexact on purpose: a calendar being a minute late costs nothing, and
        // an exact alarm here would compete with the one that matters.
        context.getSystemService(AlarmManager::class.java)
            .setAndAllowWhileIdle(AlarmManager.RTC, next, pi)
    }

    private fun midnightPendingIntent(context: Context): PendingIntent? =
        PendingIntent.getBroadcast(
            context, MIDNIGHT_REQUEST,
            Intent(context, PanchangWidgetProvider::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )

    companion object {
        private const val MIDNIGHT_REQUEST = 9001
    }
}
