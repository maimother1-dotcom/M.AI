package com.alarmx.core.permissions

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PermissionChecklistTest {

    private fun states(vararg pairs: Pair<Permission, Boolean>) =
        pairs.map { PermissionState(it.first, it.second) }

    private val allGranted = states(
        Permission.EXACT_ALARM to true,
        Permission.BATTERY_EXEMPTION to true,
        Permission.NOTIFICATIONS to true,
        Permission.FULL_SCREEN_INTENT to true,
    )

    @Test
    fun `without exact alarm the app may not claim an alarm is set`() {
        val items = PermissionChecklist.build(
            states(Permission.EXACT_ALARM to false, Permission.BATTERY_EXEMPTION to true),
            oemNeedsAutostart = false,
        )
        assertFalse(PermissionChecklist.canArmAlarm(items),
            "an unarmed alarm shown as armed is the worst failure this app has")
    }

    @Test
    fun `without a battery exemption the alarm is equally dead`() {
        val items = PermissionChecklist.build(
            states(Permission.EXACT_ALARM to true, Permission.BATTERY_EXEMPTION to false),
            oemNeedsAutostart = false,
        )
        assertFalse(PermissionChecklist.canArmAlarm(items))
    }

    @Test
    fun `missing notifications degrades the alarm but does not block it`() {
        val items = PermissionChecklist.build(
            states(
                Permission.EXACT_ALARM to true,
                Permission.BATTERY_EXEMPTION to true,
                Permission.NOTIFICATIONS to false,
            ),
            oemNeedsAutostart = false,
        )
        assertTrue(PermissionChecklist.canArmAlarm(items))
        assertTrue(PermissionChecklist.isDegraded(items))
    }

    @Test
    fun `everything granted is neither blocked nor degraded`() {
        val items = PermissionChecklist.build(allGranted, oemNeedsAutostart = false)
        assertTrue(PermissionChecklist.canArmAlarm(items))
        assertFalse(PermissionChecklist.isDegraded(items))
        assertNull(PermissionChecklist.nextToRequest(items))
    }

    @Test
    fun `a permission the OS does not have is not shown`() {
        // POST_NOTIFICATIONS does not exist below API 33. Showing a user a
        // toggle their phone does not have is a support ticket.
        val items = PermissionChecklist.build(
            listOf(
                PermissionState(Permission.EXACT_ALARM, granted = true),
                PermissionState(Permission.NOTIFICATIONS, granted = false, notApplicable = true),
            ),
            oemNeedsAutostart = false,
        )
        assertTrue(items.none { it.permission == Permission.NOTIFICATIONS })
        assertTrue(PermissionChecklist.canArmAlarm(items))
    }

    @Test
    fun `OEM autostart is hidden on devices that do not have it`() {
        val items = PermissionChecklist.build(
            states(Permission.EXACT_ALARM to true, Permission.OEM_AUTOSTART to false),
            oemNeedsAutostart = false,
        )
        assertTrue(items.none { it.permission == Permission.OEM_AUTOSTART })
    }

    @Test
    fun `OEM autostart is self-reported and must never block`() {
        // There is no API that reports it, so treating it as blocking would
        // strand a user who has genuinely granted it.
        val items = PermissionChecklist.build(
            states(
                Permission.EXACT_ALARM to true,
                Permission.BATTERY_EXEMPTION to true,
                Permission.OEM_AUTOSTART to false,
            ),
            oemNeedsAutostart = true,
        )
        val autostart = items.single { it.permission == Permission.OEM_AUTOSTART }
        assertTrue(autostart.selfReported)
        assertFalse(autostart.blocking)
        assertTrue(PermissionChecklist.canArmAlarm(items))
    }

    @Test
    fun `the broken thing is listed first`() {
        val items = PermissionChecklist.build(
            states(
                Permission.NOTIFICATIONS to false,
                Permission.EXACT_ALARM to false,
                Permission.BATTERY_EXEMPTION to true,
            ),
            oemNeedsAutostart = false,
        )
        assertEquals(Permission.EXACT_ALARM, items.first().permission,
            "the screen must open on what is actually broken")
        assertEquals(Permission.EXACT_ALARM, PermissionChecklist.nextToRequest(items))
    }

    @Test
    fun `exactly two permissions are blocking, and they are the right two`() {
        val blocking = Permission.entries.filter { PermissionChecklist.isBlocking(it) }
        assertEquals(setOf(Permission.EXACT_ALARM, Permission.BATTERY_EXEMPTION), blocking.toSet())
    }
}
