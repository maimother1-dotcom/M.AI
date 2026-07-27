package com.alarmx.app.alarm

import android.content.Context

/**
 * Tells the server an alarm was completed. PRD 8.3 and 18.5.
 *
 * Note what this does NOT send: an amount, a share tier, a day index, or a
 * "credit me" instruction. The client reports an EVENT and the server decides
 * what, if anything, it is worth. Assume the APK is decompiled on day one: a
 * user who fully controls this class must be able to gain nothing beyond what
 * real, verified ad views earn them.
 *
 * The device clock is deliberately not sent either. The day boundary is derived
 * server-side from a timezone pinned at signup, because a device-controlled
 * "local midnight" can be rolled repeatedly to farm the 7-alarm-day payout
 * gate (PRD 18.4).
 */
class AlarmCompletionReporter(private val context: Context) {

    /**
     * @param earnedRewardWindow whether the task was completed inside the ten
     *   seconds. Advisory: the server re-derives it from the ring-start event
     *   it already received, and its answer wins.
     */
    fun report(alarmId: Long, earnedRewardWindow: Boolean) {
        val payload = mapOf(
            "alarmId" to alarmId,
            "claimedWithinWindow" to earnedRewardWindow,
            // Play Integrity token, checked server-side before any reward.
            "integrityToken" to IntegrityTokenProvider(context).fetchBlocking(),
        )
        AlarmXApi.get(context).enqueue("alarm/completed", payload)
    }
}
