package com.alarmx.app.data

import android.content.Context

/**
 * 365 days of precomputed panchang, in Room. PRD 16.1.
 *
 * Computed once on first run and on any location change, roughly 365 rows of
 * about 200 bytes. The widget and the calendar screen READ ONLY. That satisfies
 * offline-first, battery on a budget phone, and widget update cost in one move.
 *
 * Production computes these with Swiss Ephemeris in Moshier mode, which needs
 * no .se1 data files and so costs nothing against the 15MB APK budget — under
 * the COMMERCIAL licence, which must be bought before distribution (PRD 16.7).
 */
class PanchangCache private constructor(private val dao: PanchangDao) {

    data class Day(
        val gregorian: String,
        val nativeDate: String,
        val tithi: String,
        val nakshatra: String,
        val festival: String?,
    )

    data class AlarmXState(
        val nextAlarmTime: String,
        val sharePercent: Int,
        val streakDays: Int,
        val examCountdown: String?,
    )

    fun today(): Day = dao.forDay(System.currentTimeMillis()).toDay()

    fun alarmxState(): AlarmXState = dao.currentState()

    companion object {
        @Volatile private var instance: PanchangCache? = null

        fun get(context: Context): PanchangCache = instance ?: synchronized(this) {
            instance ?: PanchangCache(AlarmXDatabase.get(context).panchangDao()).also { instance = it }
        }
    }
}
