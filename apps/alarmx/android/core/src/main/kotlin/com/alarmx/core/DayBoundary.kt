package com.alarmx.core

/**
 * What counts as "a day". PRD 18.4.
 *
 * This is a security control, not a formatting concern. "Local midnight" is
 * meaningless if the device decides what local means: changing the phone
 * timezone rolls the day repeatedly, which defeats
 *
 *   * the daily credited-view ceiling (PRD 2),
 *   * the streak share ladder (PRD 2), and
 *   * the >= 7 **distinct alarm-days** gate (PRD 6.3), which is the
 *     load-bearing anti-farming control in the whole product.
 *
 * So the boundary is derived from a timezone **pinned at signup** and evaluated
 * against **server-received** timestamps. The device clock is never an input.
 */
class DayBoundary(
    /** Offset of the user's pinned timezone from UTC, in minutes. Set at signup. */
    val pinnedUtcOffsetMinutes: Int,
) {
    init {
        require(pinnedUtcOffsetMinutes in -12 * 60..14 * 60) {
            "implausible timezone offset: $pinnedUtcOffsetMinutes"
        }
    }

    /**
     * The day index for a server timestamp: whole days since the epoch in the
     * user's pinned zone. Monotonic, and comparable across users.
     */
    fun dayIndex(serverEpochMillis: Long): Long {
        val shifted = serverEpochMillis + pinnedUtcOffsetMinutes * 60_000L
        return Math.floorDiv(shifted, MILLIS_PER_DAY)
    }

    /**
     * Whether a rollover from [lastDayStartMillis] to [serverEpochMillis] is
     * legitimate.
     *
     * The gap is **20 hours, not 24**, on purpose: an 8am Monday alarm followed
     * by a 7am Tuesday alarm is 23 hours apart and is a genuine second day
     * (PRD 7.4). Anything faster than 20 hours is a clock being manipulated,
     * because two real local midnights cannot be closer than that.
     */
    fun mayRollOver(lastDayStartMillis: Long, serverEpochMillis: Long): Boolean {
        if (lastDayStartMillis <= 0L) return true          // first ever day
        if (serverEpochMillis < lastDayStartMillis) return false  // clock ran backwards
        return serverEpochMillis - lastDayStartMillis >= MIN_DAY_GAP_MILLIS
    }

    companion object {
        const val MILLIS_PER_DAY = 24 * 60 * 60 * 1000L
        const val MIN_DAY_GAP_MILLIS = 20 * 60 * 60 * 1000L

        /** Users move. Changing the pinned zone is allowed, but rate-limited. */
        const val TIMEZONE_CHANGE_COOLDOWN_DAYS = 14

        fun mayChangeTimezone(lastChangeDayIndex: Long?, todayIndex: Long): Boolean =
            lastChangeDayIndex == null ||
                todayIndex - lastChangeDayIndex >= TIMEZONE_CHANGE_COOLDOWN_DAYS
    }
}
