package com.alarmx.core.oem

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * PRD 9. Getting this wrong means the alarm does not ring on most of the
 * phones this product is aimed at, so it gets tested rather than eyeballed.
 */
class OemGuideTest {

    @Test
    fun `Redmi and Poco are recognised as Xiaomi, whatever they call themselves`() {
        // Build.MANUFACTURER is not standardised. The same MIUI battery killer
        // ships under at least four different strings.
        assertEquals(Oem.XIAOMI, OemGuide.detect("Xiaomi"))
        assertEquals(Oem.XIAOMI, OemGuide.detect("Redmi"))
        assertEquals(Oem.XIAOMI, OemGuide.detect("POCO"))
        assertEquals(Oem.XIAOMI, OemGuide.detect("xiaomi", brand = "Redmi"))
    }

    @Test
    fun `Realme reports lowercase and still matches`() {
        assertEquals(Oem.REALME_OPPO, OemGuide.detect("realme"))
        assertEquals(Oem.REALME_OPPO, OemGuide.detect("OPPO"))
    }

    @Test
    fun `the other targeted families are recognised`() {
        assertEquals(Oem.VIVO, OemGuide.detect("vivo"))
        assertEquals(Oem.VIVO, OemGuide.detect("iQOO"))
        assertEquals(Oem.SAMSUNG, OemGuide.detect("samsung"))
        assertEquals(Oem.ONEPLUS, OemGuide.detect("OnePlus"))
        assertEquals(Oem.HUAWEI, OemGuide.detect("HONOR"))
    }

    @Test
    fun `an unknown manufacturer needs no walkthrough`() {
        val oem = OemGuide.detect("Google")
        assertEquals(Oem.OTHER, oem)
        assertFalse(OemGuide.needsWalkthrough(oem))
        assertTrue(OemGuide.stepsFor(oem).isEmpty(),
            "stock Android must not be shown manufacturer settings that do not exist")
    }

    @Test
    fun `the two highest-risk devices both get an autostart step`() {
        // Redmi and Realme are the two the PRD calls out for physical testing,
        // and autostart is the setting that actually kills the alarm.
        for (oem in listOf(Oem.XIAOMI, Oem.REALME_OPPO)) {
            val steps = OemGuide.stepsFor(oem)
            assertTrue(steps.any { it.id == StepId.AUTOSTART }, "$oem has no autostart step")
            assertTrue(steps.any { it.id == StepId.BATTERY_SAVER }, "$oem has no battery step")
        }
    }

    @Test
    fun `every step explains why, because users refuse what they do not understand`() {
        for (oem in Oem.entries.filter { OemGuide.needsWalkthrough(it) }) {
            for (step in OemGuide.stepsFor(oem)) {
                assertTrue(step.title.isNotBlank(), "$oem ${step.id} has no title")
                assertTrue(step.why.length > 20, "$oem ${step.id} does not say why it matters")
            }
        }
    }

    @Test
    fun `a step without a deep link either falls back or is manual by design`() {
        // The component names change between OS versions, so a missing or
        // unresolvable target must never leave the user on a dead end.
        for (oem in Oem.entries) {
            for (step in OemGuide.stepsFor(oem)) {
                if (step.target == null) continue
                assertTrue(step.target.packageName.isNotBlank())
                assertTrue(step.target.className.contains('.'),
                    "${step.id} has a class name that cannot resolve: ${step.target.className}")
                assertTrue(step.fallbackToBatterySettings,
                    "${step.id} deep links with no fallback; component names change per build")
            }
        }
    }

    @Test
    fun `notifications come last, after the harder manufacturer steps`() {
        val steps = OemGuide.stepsFor(Oem.XIAOMI)
        assertEquals(StepId.NOTIFICATIONS, steps.last().id)
        assertNotNull(steps.firstOrNull { it.id == StepId.AUTOSTART })
    }

    @Test
    fun `step ids are unique within a device, so the checklist cannot double count`() {
        for (oem in Oem.entries) {
            val ids = OemGuide.stepsFor(oem).map { it.id }
            assertEquals(ids.size, ids.distinct().size, "$oem repeats a step")
        }
    }
}
