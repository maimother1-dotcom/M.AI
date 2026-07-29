package com.alarmx.core.math

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MathSessionTest {

    @Test
    fun `the plan is five sets of four, as specified`() {
        assertEquals(5, MathPlan.SETS)
        assertEquals(4, MathPlan.PROBLEMS_PER_SET)
        assertEquals(5, MathPlan.ALL.size)
        assertTrue(MathPlan.ALL.all { it.problems == 4 })
    }

    @Test
    fun `an ad comes after every second problem, twice per set`() {
        assertEquals(listOf(false, true, false, true), (1..4).map { MathPlan.showAdAfter(it) })
        assertEquals(2, (1..4).count { MathPlan.showAdAfter(it) })
        assertEquals(MathPlan.ADS_PER_SET, (1..4).count { MathPlan.showAdAfter(it) })
    }

    @Test
    fun `a full day of maths is ten ads`() {
        assertEquals(10, MathPlan.adsForFullDay())
    }

    @Test
    fun `no alarm means no sets, whatever the time of day`() {
        // The server rejects credits for the same reason. Offering work the app
        // knows will not be paid for is how a rewards product loses trust.
        for (minute in listOf(0, 8 * 60, 13 * 60, 23 * 60)) {
            assertEquals(0, MathPlan.unlockedSets(alarmCompletedToday = false, minuteOfDay = minute),
                "sets were offered at minute $minute with no alarm completed")
        }
    }

    @Test
    fun `sets unlock in three tranches through the day`() {
        assertEquals(2, MathPlan.unlockedSets(true, 6 * 60), "morning should open two sets")
        assertEquals(2, MathPlan.unlockedSets(true, 11 * 60 + 59))
        assertEquals(4, MathPlan.unlockedSets(true, 12 * 60), "midday should open two more")
        assertEquals(4, MathPlan.unlockedSets(true, 17 * 60 + 59))
        assertEquals(5, MathPlan.unlockedSets(true, 18 * 60), "evening opens the last")
        assertEquals(5, MathPlan.unlockedSets(true, 23 * 60 + 59))
    }

    @Test
    fun `three tranches means three reasons to open the app`() {
        val tranches = MathPlan.ALL.map { it.tranche }.distinct()
        assertEquals(3, tranches.size)
        assertEquals(listOf(Tranche.MORNING, Tranche.MIDDAY, Tranche.EVENING), tranches)
    }

    @Test
    fun `the app can say when the next set opens`() {
        assertEquals(12 * 60, MathPlan.nextUnlockMinute(9 * 60))
        assertEquals(18 * 60, MathPlan.nextUnlockMinute(12 * 60))
        assertEquals(18 * 60, MathPlan.nextUnlockMinute(17 * 60))
        assertNull(MathPlan.nextUnlockMinute(18 * 60), "nothing left to promise after the last")
        assertNull(MathPlan.nextUnlockMinute(23 * 60))
    }

    @Test
    fun `an impossible time is refused rather than silently clamped`() {
        assertFailsWith<IllegalArgumentException> { MathPlan.unlockedSets(true, -1) }
        assertFailsWith<IllegalArgumentException> { MathPlan.unlockedSets(true, 24 * 60) }
    }

    @Test
    fun `an ad cannot be requested for a problem outside the set`() {
        assertFailsWith<IllegalArgumentException> { MathPlan.showAdAfter(0) }
        assertFailsWith<IllegalArgumentException> { MathPlan.showAdAfter(5) }
    }

    @Test
    fun `unlocked sets never exceed the plan`() {
        for (minute in 0 until 24 * 60) {
            val n = MathPlan.unlockedSets(true, minute)
            assertTrue(n in 0..MathPlan.SETS, "minute $minute unlocked $n sets")
        }
    }
}
