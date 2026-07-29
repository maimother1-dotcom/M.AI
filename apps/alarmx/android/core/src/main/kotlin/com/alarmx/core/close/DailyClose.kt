package com.alarmx.core.close

import com.alarmx.core.LedgerEntry
import com.alarmx.core.Paise
import com.alarmx.core.RewardEngine
import com.alarmx.core.ShareLadder
import com.alarmx.core.ShareTier

/**
 * The Daily Close receipt. PRD 4.8.
 *
 * Every figure here is **summed from the ledger**. Nothing is typed, estimated
 * or rounded up for presentation, and that is the entire point: every other
 * reward app in this category hides its arithmetic, which is exactly why nobody
 * believes them. AlarmX can show its working because its working is honest.
 *
 * A consequence worth stating plainly: if the receipt and the wallet ever
 * disagree, the receipt is right and the wallet has a bug. They are computed
 * from the same rows.
 */
data class DailyReceipt(
    val dayIndex: Long,
    val creditedViews: Int,
    val rejectedViews: Int,
    val earned: Paise,
    val tier: ShareTier,
    val streakDays: Int,
    /** The next tier the user can reach, and how many streak days away it is. */
    val nextTier: ShareTier?,
    val daysToNextTier: Int?,
    val viewsRemainingToday: Int,
) {
    /** "0.53" — display only. Never parsed back into a calculation. */
    fun earnedRupees(): String = earned.toRupeeString()

    /** 50.0, 55.0, 60.0, 70.0. */
    fun sharePercent(): Double = tier.percent

    /**
     * True when tomorrow's first alarm moves the user up a tier. This is the
     * line that does the retention work, and it is only shown when it is
     * actually true.
     */
    fun tierRisesTomorrow(): Boolean = daysToNextTier == 1
}

object DailyClose {

    fun receipt(
        dayIndex: Long,
        entries: List<LedgerEntry>,
        streakDays: Int,
        lifetimeEarned: Paise,
        ceilingPerDay: Int = RewardEngine.DAILY_VIEW_CEILING,
    ): DailyReceipt {
        val today = entries.filter { it.dayIndex == dayIndex }
        // A credited entry is one that carries a tier: the engine sets it only
        // on the paid path. Deriving it from `credited > 0` would be wrong,
        // because a legitimately credited view can round to zero paise when the
        // carry is low, and it would still have consumed one of the 20.
        val credited = today.filter { it.tier != null }
        val earned = credited.fold(Paise.ZERO) { sum, e -> sum + e.credited }

        val next = ShareLadder.nextTier(lifetimeEarned, streakDays)

        return DailyReceipt(
            dayIndex = dayIndex,
            creditedViews = credited.size,
            rejectedViews = today.size - credited.size,
            earned = earned,
            tier = ShareLadder.tierFor(lifetimeEarned, streakDays),
            streakDays = streakDays,
            nextTier = next?.first,
            daysToNextTier = next?.second,
            viewsRemainingToday = (ceilingPerDay - credited.size).coerceAtLeast(0),
        )
    }
}
