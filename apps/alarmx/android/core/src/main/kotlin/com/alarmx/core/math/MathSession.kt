package com.alarmx.core.math

/**
 * The daytime maths section. PRD 4.7.
 *
 * Five sets of four problems, an ad after every two, unlocking in three
 * tranches through the day. The tranches are the retention mechanism: one
 * sitting of twenty problems is a chore, three sittings of six or eight is a
 * habit, and the app gets opened three times instead of once.
 *
 * Everything here is gated on the alarm having been completed today. No
 * wake-up, no earning — PRD 4.7. That is what keeps every rupee traceable to a
 * real alarm rather than to someone farming ad views at 2am.
 */

enum class Tranche(
    /** Minutes after local midnight when this tranche opens. */
    val opensAtMinuteOfDay: Int,
) {
    /** Unlocked by the alarm itself, whenever that is. */
    MORNING(0),
    MIDDAY(12 * 60),
    EVENING(18 * 60),
}

data class MathSet(
    val index: Int,
    val tranche: Tranche,
    val problems: Int = MathPlan.PROBLEMS_PER_SET,
)

object MathPlan {
    const val SETS = 5
    const val PROBLEMS_PER_SET = 4
    const val ADS_PER_SET = 2
    /** An ad after every second problem. PRD 4.7. */
    const val PROBLEMS_PER_AD = 2

    val ALL: List<MathSet> = (0 until SETS).map { MathSet(it, trancheFor(it)) }

    fun trancheFor(setIndex: Int): Tranche = when (setIndex) {
        0, 1 -> Tranche.MORNING
        2, 3 -> Tranche.MIDDAY
        else -> Tranche.EVENING
    }

    /**
     * How many sets are open right now.
     *
     * Returns 0 whenever the alarm has not been completed today, regardless of
     * the time. The gate is not a UI decision — the server rejects credits for
     * the same reason, and this exists so the app does not offer work it knows
     * will not be paid for.
     */
    fun unlockedSets(alarmCompletedToday: Boolean, minuteOfDay: Int): Int {
        require(minuteOfDay in 0 until 24 * 60) { "minute of day out of range: $minuteOfDay" }
        if (!alarmCompletedToday) return 0
        return ALL.count { minuteOfDay >= it.tranche.opensAtMinuteOfDay }
    }

    /** True when an ad should be shown after this problem, one-based within the set. */
    fun showAdAfter(problemNumberInSet: Int): Boolean {
        require(problemNumberInSet in 1..PROBLEMS_PER_SET) {
            "problem $problemNumberInSet is not in a set of $PROBLEMS_PER_SET"
        }
        return problemNumberInSet % PROBLEMS_PER_AD == 0
    }

    /** Ads a user sees if they finish everything: 5 sets x 2 = 10. */
    fun adsForFullDay(): Int = SETS * ADS_PER_SET

    /**
     * When the next locked set opens, as a minute of the day, or null when all
     * five are already available. Drives the "aur 2 set 12 baje khulenge" line,
     * which is the reason the user comes back at midday.
     */
    fun nextUnlockMinute(minuteOfDay: Int): Int? =
        ALL.map { it.tranche.opensAtMinuteOfDay }
            .distinct()
            .filter { it > minuteOfDay }
            .minOrNull()
}
