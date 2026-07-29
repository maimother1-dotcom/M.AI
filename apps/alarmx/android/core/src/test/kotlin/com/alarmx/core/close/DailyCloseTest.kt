package com.alarmx.core.close

import com.alarmx.core.LedgerEntry
import com.alarmx.core.Paise
import com.alarmx.core.RewardSource
import com.alarmx.core.ShareTier
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DailyCloseTest {

    private fun credited(day: Long, paise: Long, tier: ShareTier = ShareTier.BASE) = LedgerEntry(
        dayIndex = day, source = RewardSource.MATH_SET, verified = true,
        grossMicropaise = 10_560L, tier = tier, credited = Paise(paise),
        transactionId = "tx-${Random.nextLong()}",
    )

    private fun rejected(day: Long) = LedgerEntry(
        dayIndex = day, source = RewardSource.MATH_SET, verified = false,
        grossMicropaise = 0L, tier = null, credited = Paise.ZERO, transactionId = null,
    )

    @Test
    fun `the receipt is summed from the ledger, never typed`() {
        val entries = listOf(credited(10, 7), credited(10, 7), credited(10, 8))
        val r = DailyClose.receipt(10, entries, streakDays = 3, lifetimeEarned = Paise.ofRupees(20))
        assertEquals(Paise(22), r.earned)
        assertEquals("0.22", r.earnedRupees())
        assertEquals(3, r.creditedViews)
    }

    @Test
    fun `yesterday's entries do not appear on today's receipt`() {
        val entries = listOf(credited(9, 100), credited(10, 7))
        val r = DailyClose.receipt(10, entries, streakDays = 1, lifetimeEarned = Paise.ofRupees(20))
        assertEquals(Paise(7), r.earned)
        assertEquals(1, r.creditedViews)
    }

    @Test
    fun `a rejected view is counted but pays nothing`() {
        val entries = listOf(credited(10, 7), rejected(10), rejected(10))
        val r = DailyClose.receipt(10, entries, streakDays = 1, lifetimeEarned = Paise.ofRupees(20))
        assertEquals(Paise(7), r.earned)
        assertEquals(1, r.creditedViews)
        assertEquals(2, r.rejectedViews)
    }

    @Test
    fun `a credited view that rounds to zero still consumes one of the twenty`() {
        // The carry can leave a genuine credit at zero paise. Deriving
        // "credited" from `credited > 0` would silently hand the user a free
        // extra view every time that happened.
        val entries = listOf(credited(10, 0), credited(10, 7))
        val r = DailyClose.receipt(10, entries, streakDays = 1, lifetimeEarned = Paise.ofRupees(20))
        assertEquals(2, r.creditedViews)
        assertEquals(18, r.viewsRemainingToday)
    }

    @Test
    fun `the ceiling is reported as what is left, and never goes negative`() {
        val entries = List(25) { credited(10, 7) }
        val r = DailyClose.receipt(10, entries, streakDays = 1, lifetimeEarned = Paise.ofRupees(20))
        assertEquals(0, r.viewsRemainingToday)
    }

    @Test
    fun `a new user is on the acquisition share and has no next tier to chase`() {
        val r = DailyClose.receipt(1, listOf(credited(1, 7)), streakDays = 1, lifetimeEarned = Paise(50))
        assertEquals(ShareTier.ACQUISITION, r.tier)
        assertEquals(70.0, r.sharePercent())
        assertEquals(null, r.nextTier, "already on the highest share")
    }

    @Test
    fun `the tier preview is the line that brings the user back tomorrow`() {
        val r = DailyClose.receipt(
            10, listOf(credited(10, 7)), streakDays = 6, lifetimeEarned = Paise.ofRupees(20),
        )
        assertEquals(ShareTier.BASE, r.tier)
        assertEquals(ShareTier.STREAK_7, r.nextTier)
        assertEquals(1, r.daysToNextTier)
        assertTrue(r.tierRisesTomorrow(), "day 6 must be told day 7 pays more")
    }

    @Test
    fun `the tomorrow promise is not shown when it is not true`() {
        val r = DailyClose.receipt(
            10, listOf(credited(10, 7)), streakDays = 3, lifetimeEarned = Paise.ofRupees(20),
        )
        assertEquals(4, r.daysToNextTier)
        assertFalse(r.tierRisesTomorrow())
    }

    @Test
    fun `at the top of the ladder there is nothing left to promise`() {
        val r = DailyClose.receipt(
            10, listOf(credited(10, 7)), streakDays = 45, lifetimeEarned = Paise.ofRupees(200),
        )
        assertEquals(ShareTier.STREAK_30, r.tier)
        assertEquals(60.0, r.sharePercent())
        assertEquals(null, r.nextTier)
        assertFalse(r.tierRisesTomorrow())
    }

    @Test
    fun `an empty day is an honest zero, not an error`() {
        val r = DailyClose.receipt(10, emptyList(), streakDays = 0, lifetimeEarned = Paise.ZERO)
        assertEquals(Paise.ZERO, r.earned)
        assertEquals("0.00", r.earnedRupees())
        assertEquals(0, r.creditedViews)
        assertEquals(20, r.viewsRemainingToday)
    }

    @Test
    fun `randomised - the receipt always equals the sum of the day's credits`() {
        val rng = Random(20260729)
        repeat(200) {
            val day = rng.nextLong(0, 100)
            val entries = buildList {
                repeat(rng.nextInt(0, 25)) {
                    val d = if (rng.nextInt(4) == 0) day + 1 else day
                    if (rng.nextInt(5) == 0) add(rejected(d)) else add(credited(d, rng.nextLong(0, 20)))
                }
            }
            val expected = entries
                .filter { it.dayIndex == day && it.tier != null }
                .fold(0L) { sum, e -> sum + e.credited.value }

            val r = DailyClose.receipt(day, entries, rng.nextInt(0, 60), Paise.ofRupees(20))
            assertEquals(expected, r.earned.value, "receipt disagreed with the ledger")
        }
    }
}
