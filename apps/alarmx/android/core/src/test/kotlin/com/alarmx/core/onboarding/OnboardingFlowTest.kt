package com.alarmx.core.onboarding

import com.alarmx.core.permissions.Permission
import com.alarmx.core.permissions.PermissionChecklist
import com.alarmx.core.permissions.PermissionState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OnboardingFlowTest {

    private fun perms(vararg pairs: Pair<Permission, Boolean>) =
        PermissionChecklist.build(
            pairs.map { PermissionState(it.first, it.second) },
            oemNeedsAutostart = false,
        )

    private val allPermsGranted = perms(
        Permission.EXACT_ALARM to true,
        Permission.BATTERY_EXEMPTION to true,
        Permission.NOTIFICATIONS to true,
    )

    private fun signedIn(state: OnboardingState = OnboardingState()) = state.copy(
        languageChosen = true, examChosen = true, phoneEntered = true, otpVerified = true,
    )

    @Test
    fun `a fresh install starts at language`() {
        assertEquals(OnboardingStep.LANGUAGE, OnboardingFlow.current(OnboardingState()))
    }

    @Test
    fun `denying a permission leaves the user on that step rather than stranded`() {
        // The failure this whole design exists to prevent: the app pushing past
        // a Deny and landing on a home screen with an alarm that cannot ring.
        val state = signedIn().copy(
            permissions = perms(Permission.EXACT_ALARM to false, Permission.BATTERY_EXEMPTION to true),
        )
        assertEquals(OnboardingStep.EXACT_ALARM, OnboardingFlow.current(state))
        // And again, because denying it does not advance anything.
        assertEquals(OnboardingStep.EXACT_ALARM, OnboardingFlow.current(state))
    }

    @Test
    fun `the two alarm-critical permissions cannot be skipped`() {
        assertFalse(OnboardingFlow.canSkip(OnboardingStep.EXACT_ALARM))
        assertFalse(OnboardingFlow.canSkip(OnboardingStep.BATTERY_EXEMPTION))
    }

    @Test
    fun `notifications and the OEM walkthrough can be skipped`() {
        assertTrue(OnboardingFlow.canSkip(OnboardingStep.NOTIFICATIONS))
        assertTrue(OnboardingFlow.canSkip(OnboardingStep.OEM_WALKTHROUGH))
    }

    @Test
    fun `identity can be deferred, so the alarm works before any phone number`() {
        val state = OnboardingState(
            languageChosen = true, examChosen = true, identityDeferred = true,
            permissions = allPermsGranted,
        )
        assertTrue(OnboardingFlow.canDefer(OnboardingStep.PHONE))
        assertEquals(OnboardingStep.FIRST_ALARM, OnboardingFlow.current(state))
        assertTrue(OnboardingFlow.applicableSteps(state).none { it == OnboardingStep.PHONE })
    }

    @Test
    fun `the OEM walkthrough only appears on devices that need it`() {
        val stock = signedIn().copy(permissions = allPermsGranted, oemNeedsWalkthrough = false)
        assertEquals(OnboardingStep.FIRST_ALARM, OnboardingFlow.current(stock))

        val redmi = stock.copy(oemNeedsWalkthrough = true)
        assertEquals(OnboardingStep.OEM_WALKTHROUGH, OnboardingFlow.current(redmi))
    }

    @Test
    fun `the full happy path reaches DONE`() {
        val state = signedIn().copy(
            permissions = allPermsGranted,
            oemNeedsWalkthrough = true, oemWalkthroughSeen = true,
            firstAlarmSet = true,
        )
        assertEquals(OnboardingStep.DONE, OnboardingFlow.current(state))
        assertTrue(OnboardingFlow.isComplete(state))
    }

    @Test
    fun `revoking a blocking permission after finishing un-completes onboarding`() {
        // A user can revoke SCHEDULE_EXACT_ALARM in system settings at any time.
        // Coming back must not land them on a home screen that lies to them.
        val done = signedIn().copy(permissions = allPermsGranted, firstAlarmSet = true)
        assertTrue(OnboardingFlow.isComplete(done))

        val revoked = done.copy(
            permissions = perms(Permission.EXACT_ALARM to false, Permission.BATTERY_EXEMPTION to true),
        )
        assertFalse(OnboardingFlow.isComplete(revoked))
        assertEquals(OnboardingStep.EXACT_ALARM, OnboardingFlow.current(revoked))
    }

    @Test
    fun `progress counts only the steps this device will actually show`() {
        val deferred = OnboardingState(
            languageChosen = true, examChosen = true, identityDeferred = true,
            permissions = allPermsGranted,
        )
        val (step, total) = OnboardingFlow.progress(deferred)
        assertEquals(OnboardingFlow.applicableSteps(deferred).size, total)
        assertTrue(step in 1..total, "step $step of $total is not a sensible position")

        // Signing in properly adds two steps, and the count must follow.
        val withPhone = deferred.copy(identityDeferred = false)
        assertEquals(total + 2, OnboardingFlow.progress(withPhone).second)
    }

    @Test
    fun `progress never reports a step outside the list`() {
        val done = signedIn().copy(permissions = allPermsGranted, firstAlarmSet = true)
        val (step, total) = OnboardingFlow.progress(done)
        assertEquals(total + 1, step, "DONE should read as one past the end, not as index -1")
    }

    @Test
    fun `a permission the device does not have is skipped entirely`() {
        val state = signedIn().copy(
            permissions = PermissionChecklist.build(
                listOf(
                    PermissionState(Permission.EXACT_ALARM, granted = true),
                    PermissionState(Permission.BATTERY_EXEMPTION, granted = true),
                    PermissionState(Permission.NOTIFICATIONS, granted = false, notApplicable = true),
                ),
                oemNeedsAutostart = false,
            ),
        )
        assertEquals(OnboardingStep.FIRST_ALARM, OnboardingFlow.current(state))
    }
}
