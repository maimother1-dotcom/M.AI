package com.alarmx.app.ui

import android.app.Activity
import android.os.Bundle
import com.alarmx.app.alarm.AlarmRingService
import com.alarmx.app.alarm.AlarmScheduler

/**
 * The ring screen. PRD 3.1 and 4.6.
 *
 * THERE IS NO AD CODE IN THIS FILE AND THERE NEVER WILL BE. Nothing may be
 * placed between the alarm firing and the user being able to switch it off:
 * no interstitial, no banner, no rewarded video, not even a spinner waiting on
 * an ad request. The dismissal task must be interactive the instant the alarm
 * fires.
 *
 * It was modelled rather than argued about: an ad here earns Rs0.73 per user
 * per month. That is the entire value being weighed against delaying somebody
 * switching off a 5am alarm, and against handing a Play reviewer a reward app
 * that blocks an alarm.
 *
 * The ten-second reward window only decides whether the dismissal EARNS. It
 * never stops the alarm — that is the change that de-risked this product.
 */
class RingActivity : Activity() {

    private var alarmId = -1L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        alarmId = intent.getLongExtra(AlarmScheduler.EXTRA_ALARM_ID, -1L)
        setContentView(dismissalTaskView())
    }

    /**
     * Shake, math, or a registered QR scan — chosen and LOCKED the night
     * before, so rational 11pm-self binds sleepy 6am-self (PRD 3.3).
     */
    private fun dismissalTaskView() = TaskViewFactory.create(this, alarmId) { completedAt ->
        onTaskCompleted(completedAt)
    }

    private fun onTaskCompleted(completedAtMillis: Long) {
        val earned = completedAtMillis - ringStartedAt <= AlarmRingService.REWARD_WINDOW_MILLIS
        stopService(android.content.Intent(this, AlarmRingService::class.java))

        // The credit is REQUESTED here and decided on the server. The client
        // never computes an amount, a share tier, or a day index. PRD 8.3.
        AlarmCompletionReporter(this).report(alarmId, earnedRewardWindow = earned)
        finish()
    }

    /** Set when the service began ringing; the activity may open slightly later. */
    private val ringStartedAt: Long
        get() = intent.getLongExtra(EXTRA_RING_STARTED_AT, System.currentTimeMillis())

    /** Back must not dismiss the alarm. Completing the task is the only exit. */
    @Deprecated("Back is intentionally inert on the ring screen")
    override fun onBackPressed() = Unit

    companion object {
        const val EXTRA_RING_STARTED_AT = "ring_started_at"
    }
}
