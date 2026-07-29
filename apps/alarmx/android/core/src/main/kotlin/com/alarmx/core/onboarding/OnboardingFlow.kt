package com.alarmx.core.onboarding

import com.alarmx.core.permissions.ChecklistItem
import com.alarmx.core.permissions.Permission
import com.alarmx.core.permissions.PermissionChecklist

/**
 * Onboarding as a state machine rather than a stack of Activities that each
 * decide what comes next.
 *
 * Written this way for one reason: **a user who denies a permission must be
 * routed, not stranded.** The common failure in this kind of flow is a screen
 * that assumes the previous one succeeded — the user taps Deny, the app pushes
 * on regardless, and they end up on a home screen with an alarm that will never
 * ring and no way back. Here every step is derived from state, so denying
 * something simply means the step is still current.
 */

enum class OnboardingStep {
    LANGUAGE,
    EXAM,
    PHONE,
    OTP,
    EXACT_ALARM,
    NOTIFICATIONS,
    BATTERY_EXEMPTION,
    OEM_WALKTHROUGH,
    FIRST_ALARM,
    DONE,
}

data class OnboardingState(
    val languageChosen: Boolean = false,
    val examChosen: Boolean = false,
    val phoneEntered: Boolean = false,
    val otpVerified: Boolean = false,
    /** Set when the user chooses to sign in later. Identity is only needed to be paid. */
    val identityDeferred: Boolean = false,
    val permissions: List<ChecklistItem> = emptyList(),
    val oemNeedsWalkthrough: Boolean = false,
    val oemWalkthroughSeen: Boolean = false,
    val firstAlarmSet: Boolean = false,
) {
    fun granted(p: Permission): Boolean =
        permissions.firstOrNull { it.permission == p }?.granted ?: true

    fun applies(p: Permission): Boolean = permissions.any { it.permission == p }
}

object OnboardingFlow {

    /**
     * The current step. Every call recomputes from scratch, so there is no
     * cursor to get out of step with reality — reinstalling permissions in
     * system settings and coming back lands on the right screen automatically.
     */
    fun current(state: OnboardingState): OnboardingStep = when {
        !state.languageChosen -> OnboardingStep.LANGUAGE
        !state.examChosen -> OnboardingStep.EXAM

        // Identity. Deferrable on purpose — see [canDefer].
        !state.identityDeferred && !state.phoneEntered -> OnboardingStep.PHONE
        !state.identityDeferred && !state.otpVerified -> OnboardingStep.OTP

        // The alarm cannot ring without these two, so they are not skippable.
        state.applies(Permission.EXACT_ALARM) && !state.granted(Permission.EXACT_ALARM) ->
            OnboardingStep.EXACT_ALARM
        state.applies(Permission.BATTERY_EXEMPTION) && !state.granted(Permission.BATTERY_EXEMPTION) ->
            OnboardingStep.BATTERY_EXEMPTION

        state.applies(Permission.NOTIFICATIONS) && !state.granted(Permission.NOTIFICATIONS) ->
            OnboardingStep.NOTIFICATIONS

        state.oemNeedsWalkthrough && !state.oemWalkthroughSeen -> OnboardingStep.OEM_WALKTHROUGH

        !state.firstAlarmSet -> OnboardingStep.FIRST_ALARM
        else -> OnboardingStep.DONE
    }

    /**
     * Whether a step may be skipped without breaking the product.
     *
     * `EXACT_ALARM` and `BATTERY_EXEMPTION` are the two that cannot: skipping
     * either produces an app that shows an armed alarm and then does not ring,
     * which is worse than refusing to continue.
     */
    fun canSkip(step: OnboardingStep): Boolean = when (step) {
        OnboardingStep.EXACT_ALARM, OnboardingStep.BATTERY_EXEMPTION -> false
        OnboardingStep.PHONE, OnboardingStep.OTP -> true
        OnboardingStep.NOTIFICATIONS, OnboardingStep.OEM_WALKTHROUGH -> true
        OnboardingStep.LANGUAGE, OnboardingStep.EXAM -> true
        OnboardingStep.FIRST_ALARM, OnboardingStep.DONE -> false
    }

    /**
     * Identity can wait until the money does.
     *
     * Asking for a phone number before the user has seen the app work is the
     * largest single drop-off in this category, and the alarm — the entire core
     * function — needs no account at all. Nothing can be *withdrawn* without a
     * verified number, so the gate still exists; it just sits where the user
     * already wants something from us instead of where we want something from
     * them.
     */
    fun canDefer(step: OnboardingStep): Boolean =
        step == OnboardingStep.PHONE || step == OnboardingStep.OTP

    /** Steps that will actually be shown on this device, for a progress indicator. */
    fun applicableSteps(state: OnboardingState): List<OnboardingStep> = buildList {
        add(OnboardingStep.LANGUAGE)
        add(OnboardingStep.EXAM)
        if (!state.identityDeferred) { add(OnboardingStep.PHONE); add(OnboardingStep.OTP) }
        if (state.applies(Permission.EXACT_ALARM)) add(OnboardingStep.EXACT_ALARM)
        if (state.applies(Permission.BATTERY_EXEMPTION)) add(OnboardingStep.BATTERY_EXEMPTION)
        if (state.applies(Permission.NOTIFICATIONS)) add(OnboardingStep.NOTIFICATIONS)
        if (state.oemNeedsWalkthrough) add(OnboardingStep.OEM_WALKTHROUGH)
        add(OnboardingStep.FIRST_ALARM)
    }

    /** "Step 3 of 7", one-based. Returns total+1 at DONE. */
    fun progress(state: OnboardingState): Pair<Int, Int> {
        val steps = applicableSteps(state)
        val step = current(state)
        val index = steps.indexOf(step)
        return (if (index < 0) steps.size + 1 else index + 1) to steps.size
    }

    /**
     * Whether onboarding may finish. Deliberately stricter than [current]
     * reaching DONE: it re-checks the blocking permissions, so a user who
     * revoked one in system settings mid-flow cannot land on the home screen
     * believing their alarm is armed.
     */
    fun isComplete(state: OnboardingState): Boolean =
        current(state) == OnboardingStep.DONE &&
            PermissionChecklist.canArmAlarm(state.permissions)
}
