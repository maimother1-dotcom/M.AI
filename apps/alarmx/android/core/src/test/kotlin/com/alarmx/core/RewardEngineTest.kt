package com.alarmx.core

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Base-column value of one verified rewarded view: Rs0.1056 = 10.56 paise. */
private const val GROSS_UP = CarryingRounder.VIEW_GROSS_MICROPAISE
private val IST = DayBoundary(pinnedUtcOffsetMinutes = 330)

private fun readyState(day: Long) = UserState(
    lifetimeEarned = Paise.ofRupees(20),   // past the acquisition boost
    alarmCompletedForDay = day,
    currentDayIndex = day,
)

class MoneyTest {

    @Test
    fun `money cannot be negative`() {
        assertFailsWith<IllegalArgumentException> { Paise(-1) }
    }

    @Test
    fun `a payout cannot overdraw the balance`() {
        assertFailsWith<IllegalArgumentException> { Paise(500) - Paise(501) }
    }

    @Test
    fun `rounding is always downward`() {
        // 5.28 paise entitlement must credit 5 paise, never 6.
        val r = CarryingRounder()
        assertEquals(Paise(5), r.take(5_280))   // 5.28 paise -> 5, never 6
        assertEquals(280L, r.carry)
    }

    @Test
    fun `the carry pays out once it reaches a whole paisa`() {
        val r = CarryingRounder()
        var total = Paise.ZERO
        repeat(25) { total += r.take(5_280) }   // 25 x 5.28 paise = 132 paise exactly
        assertEquals(Paise(132), total)
        assertEquals(0L, r.carry)
    }

    @Test
    fun `the carry never lets the user be overpaid, at any prefix`() {
        val r = CarryingRounder()
        var paid = 0L
        var entitled = 0L
        repeat(1_000) {
            entitled += 5_280                // 5.28 paise per step
            paid += r.take(5_280).value
            assertTrue(paid <= entitled / 1000,
                "overpaid after step $it: $paid > ${entitled / 1000}")
        }
    }

    @Test
    fun `the carry never loses more than a paisa overall`() {
        val r = CarryingRounder()
        var paid = 0L
        repeat(10_000) { paid += r.take(5_280).value }
        val entitled = 10_000L * 5_280 / 1000
        assertTrue(entitled - paid < 1, "lost ${entitled - paid} paise to rounding")
    }
}

class ShareLadderTest {

    @Test
    fun `tiers follow the streak`() {
        val rich = Paise.ofRupees(20)
        assertEquals(ShareTier.BASE, ShareLadder.tierFor(rich, 0))
        assertEquals(ShareTier.BASE, ShareLadder.tierFor(rich, 6))
        assertEquals(ShareTier.STREAK_7, ShareLadder.tierFor(rich, 7))
        assertEquals(ShareTier.STREAK_30, ShareLadder.tierFor(rich, 30))
    }

    @Test
    fun `a new user is on the acquisition boost until the first ten rupees`() {
        assertEquals(ShareTier.ACQUISITION, ShareLadder.tierFor(Paise.ofRupees(9), 30))
        assertEquals(ShareTier.STREAK_30, ShareLadder.tierFor(Paise.ofRupees(10), 30))
    }

    @Test
    fun `entitlement is a fraction of what actually arrived`() {
        // 10_560 micropaise (10.56 paise) at 50% = 5_280 micropaise = 5.28 paise.
        assertEquals(5_280, ShareLadder.entitlementMicropaise(GROSS_UP, ShareTier.BASE))
        assertEquals(6_336, ShareLadder.entitlementMicropaise(GROSS_UP, ShareTier.STREAK_30))
        assertEquals(7_392, ShareLadder.entitlementMicropaise(GROSS_UP, ShareTier.ACQUISITION))
    }

    @Test
    fun `zero revenue pays zero at every tier, jackpot included`() {
        for (tier in ShareTier.entries) {
            assertEquals(0, ShareLadder.entitlementMicropaise(0, tier, spinBonusBasisPoints = 10_000))
        }
    }

    @Test
    fun `the spin multiplies revenue that arrived, it does not create any`() {
        val plain = ShareLadder.entitlementMicropaise(GROSS_UP, ShareTier.BASE)
        val doubled = ShareLadder.entitlementMicropaise(GROSS_UP, ShareTier.BASE, 10_000)
        assertEquals(plain * 2, doubled)
    }
}

class DayBoundaryTest {

    @Test
    fun `a rollover minutes later is refused`() {
        val now = 1_800_000_000_000L
        assertTrue(!IST.mayRollOver(now, now + 60_000))
    }

    @Test
    fun `an eight am Monday then seven am Tuesday alarm is two days`() {
        val now = 1_800_000_000_000L
        val twentyThreeHours = 23 * 60 * 60 * 1000L
        assertTrue(IST.mayRollOver(now, now + twentyThreeHours))
    }

    @Test
    fun `nineteen hours is refused, twenty is allowed`() {
        val now = 1_800_000_000_000L
        assertTrue(!IST.mayRollOver(now, now + 19 * 3_600_000L))
        assertTrue(IST.mayRollOver(now, now + 20 * 3_600_000L))
    }

    @Test
    fun `a clock running backwards is refused`() {
        val now = 1_800_000_000_000L
        assertTrue(!IST.mayRollOver(now, now - 3_600_000L))
    }

    @Test
    fun `the day index uses the pinned zone, not the devices`() {
        // 2026-07-26T19:00Z is already 2026-07-27 in IST (+5:30).
        val utcEvening = 1_785_099_600_000L
        val utc = DayBoundary(0)
        assertTrue(IST.dayIndex(utcEvening) >= utc.dayIndex(utcEvening))
    }

    @Test
    fun `changing the pinned timezone is rate limited`() {
        assertTrue(DayBoundary.mayChangeTimezone(null, 100))
        assertTrue(!DayBoundary.mayChangeTimezone(100, 105))
        assertTrue(DayBoundary.mayChangeTimezone(100, 114))
    }

    @Test
    fun `an implausible offset is rejected`() {
        assertFailsWith<IllegalArgumentException> { DayBoundary(999) }
    }
}

class RewardEngineTest {

    private val engine = RewardEngine()
    private val now = 1_800_000_000_000L
    private val today = IST.dayIndex(now)

    @Test
    fun `an unverified view credits nothing`() {
        val (after, result) = engine.credit(
            readyState(today), RewardSource.MATH_SET,
            verified = false, grossMicropaise = GROSS_UP,
            transactionId = "tx-1", serverEpochMillis = now, boundary = IST,
        )
        assertTrue(result is CreditResult.Rejected)
        assertEquals(RejectReason.NOT_VERIFIED, (result as CreditResult.Rejected).reason)
        assertEquals(Paise.ZERO, after.withdrawable)
        assertNotNull(result.entry, "a rejected view is still logged, not silently dropped")
    }

    @Test
    fun `a verified view credits the share, rounded down`() {
        val (after, result) = engine.credit(
            readyState(today), RewardSource.MATH_SET, true, GROSS_UP, "tx-1", now, IST,
        )
        assertTrue(result is CreditResult.Credited)
        assertEquals(Paise(5), after.withdrawable)     // 5.28 paise -> 5, never 6
        assertEquals(280L, after.carryMicropaise)
    }

    @Test
    fun `replaying the same transaction id pays once`() {
        var state = readyState(today)
        val (s1, r1) = engine.credit(state, RewardSource.MATH_SET, true, GROSS_UP, "tx-1", now, IST)
        state = s1
        val (s2, r2) = engine.credit(state, RewardSource.MATH_SET, true, GROSS_UP, "tx-1", now, IST)
        assertTrue(r1 is CreditResult.Credited)
        assertTrue(r2 is CreditResult.Rejected)
        assertEquals(RejectReason.DUPLICATE, (r2 as CreditResult.Rejected).reason)
        assertEquals(s1.withdrawable, s2.withdrawable)
    }

    @Test
    fun `earning is locked until the alarm is completed`() {
        val noAlarm = UserState(lifetimeEarned = Paise.ofRupees(20), alarmCompletedForDay = null)
        val (after, result) = engine.credit(
            noAlarm, RewardSource.MATH_SET, true, GROSS_UP, "tx-1", now, IST,
        )
        assertEquals(RejectReason.ALARM_NOT_COMPLETED, (result as CreditResult.Rejected).reason)
        assertEquals(Paise.ZERO, after.withdrawable)
    }

    @Test
    fun `yesterdays alarm does not unlock todays earning`() {
        val stale = readyState(today).copy(alarmCompletedForDay = today - 1)
        val (_, result) = engine.credit(
            stale, RewardSource.MATH_SET, true, GROSS_UP, "tx-1", now, IST,
        )
        assertEquals(RejectReason.ALARM_NOT_COMPLETED, (result as CreditResult.Rejected).reason)
    }

    @Test
    fun `the daily ceiling holds at twenty`() {
        var state = readyState(today)
        var credited = 0
        repeat(40) { i ->
            val (next, result) = engine.credit(
                state, RewardSource.MATH_SET, true, GROSS_UP, "tx-$i", now, IST,
            )
            state = next
            if (result is CreditResult.Credited) credited++
        }
        assertEquals(RewardEngine.DAILY_VIEW_CEILING, credited)
        assertEquals(20, state.creditedViewsToday)
    }

    @Test
    fun `an account under review earns nothing`() {
        val flagged = readyState(today).copy(underReview = true)
        val (_, result) = engine.credit(
            flagged, RewardSource.MATH_SET, true, GROSS_UP, "tx-1", now, IST,
        )
        assertEquals(RejectReason.ACCOUNT_UNDER_REVIEW, (result as CreditResult.Rejected).reason)
    }

    @Test
    fun `total fill failure pays exactly zero`() {
        var state = readyState(today)
        repeat(20) { i ->
            val (next, _) = engine.credit(
                state, RewardSource.MATH_SET, false, GROSS_UP, "tx-$i", now, IST,
            )
            state = next
        }
        assertEquals(Paise.ZERO, state.withdrawable)
    }

    @Test
    fun `halving the realised value halves the payout`() {
        fun run(gross: Long): Long {
            var state = readyState(today)
            repeat(10) { i ->
                val (next, _) = engine.credit(
                    state, RewardSource.MATH_SET, true, gross, "tx-$i", now, IST,
                )
                state = next
            }
            return state.withdrawable.value
        }
        val full = run(GROSS_UP)
        val half = run(GROSS_UP / 2)
        assertTrue(Math.abs(full - half * 2) <= 1, "full=$full half=$half")
    }

    /**
     * The invariant the whole design exists to protect: across any random mix
     * of tiers, spin bonuses, fill failures and replays, the user is never paid
     * more than the share of what the ad network actually reported.
     */
    @Test
    fun `randomised - the engine never pays more than was earned`() {
        val rng = Random(20260726)
        repeat(200) { trial ->
            var state = readyState(today).copy(
                streakDays = rng.nextInt(0, 60),
                spinBonusBasisPoints = listOf(0, 500, 1000, 2000, 4000, 10000).random(rng),
            )
            var entitledMicropaise = 0L
            repeat(RewardEngine.DAILY_VIEW_CEILING) { i ->
                val verified = rng.nextInt(10) > 2
                val gross = rng.nextLong(0, 30_000)
                val tier = ShareLadder.tierFor(state.lifetimeEarned, state.streakDays)
                val (next, result) = engine.credit(
                    state, RewardSource.MATH_SET, verified, gross, "t$trial-$i", now, IST,
                )
                if (result is CreditResult.Credited) {
                    entitledMicropaise += ShareLadder.entitlementMicropaise(
                        gross, tier, state.spinBonusBasisPoints,
                    )
                }
                state = next
            }
            val paidMicropaise = state.withdrawable.value * CarryingRounder.MICROPAISE_PER_PAISA
            assertTrue(
                paidMicropaise <= entitledMicropaise,
                "trial $trial overpaid: $paidMicropaise > $entitledMicropaise",
            )
        }
    }
}
