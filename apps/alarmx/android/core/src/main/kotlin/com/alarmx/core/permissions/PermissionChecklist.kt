package com.alarmx.core.permissions

/**
 * What the app is allowed to do, and what it must stop claiming when it is not.
 *
 * `AlarmScheduler` already refuses to schedule when exact-alarm permission is
 * missing, and throws rather than pretending. This is the other half of that
 * decision: the state a screen renders so the refusal turns into something the
 * user can fix, instead of an alarm that quietly never rings.
 *
 * Pure Kotlin so it is actually tested. The Android layer queries the real
 * system state and hands it in.
 */

enum class Permission {
    /** SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM. Without it there is no product. */
    EXACT_ALARM,

    /** POST_NOTIFICATIONS, API 33+. The alarm needs a foreground-service notification. */
    NOTIFICATIONS,

    /** REQUEST_IGNORE_BATTERY_OPTIMIZATIONS. Stock Doze exemption. */
    BATTERY_EXEMPTION,

    /**
     * USE_FULL_SCREEN_INTENT. On API 34+ this is granted by default only for
     * apps whose core function is alarms or calls, and Google may revoke it on
     * review. If it is missing the alarm rings without taking over the screen,
     * which on a locked phone means the user sleeps through it.
     */
    FULL_SCREEN_INTENT,

    /** The manufacturer's autostart list. Not a real permission, hence unverifiable. */
    OEM_AUTOSTART,
}

data class PermissionState(
    val permission: Permission,
    val granted: Boolean,
    /** True when the OS on this device does not have the concept at all. */
    val notApplicable: Boolean = false,
)

data class ChecklistItem(
    val permission: Permission,
    val granted: Boolean,
    /** The alarm cannot work at all without this one. */
    val blocking: Boolean,
    /**
     * True when the app cannot verify the answer and is trusting the user.
     * Only OEM autostart: there is no API that reports it.
     */
    val selfReported: Boolean,
)

object PermissionChecklist {

    /**
     * Blocking means "the alarm will not ring", not "the feature is degraded".
     *
     * Only two qualify. Notifications and the full-screen intent make the alarm
     * worse but not silent, and OEM autostart cannot be verified so it must
     * never block a user who has actually granted it.
     */
    fun isBlocking(permission: Permission): Boolean = when (permission) {
        Permission.EXACT_ALARM -> true
        Permission.BATTERY_EXEMPTION -> true
        Permission.NOTIFICATIONS -> false
        Permission.FULL_SCREEN_INTENT -> false
        Permission.OEM_AUTOSTART -> false
    }

    fun build(states: List<PermissionState>, oemNeedsAutostart: Boolean): List<ChecklistItem> =
        states
            .filterNot { it.notApplicable }
            .filterNot { it.permission == Permission.OEM_AUTOSTART && !oemNeedsAutostart }
            .map {
                ChecklistItem(
                    permission = it.permission,
                    granted = it.granted,
                    blocking = isBlocking(it.permission),
                    selfReported = it.permission == Permission.OEM_AUTOSTART,
                )
            }
            // Blocking items first, then ungranted, so the screen opens on the
            // thing that is actually broken rather than a tidy alphabetical list.
            .sortedWith(compareByDescending<ChecklistItem> { it.blocking && !it.granted }
                .thenByDescending { !it.granted })

    /** Whether the app may honestly tell the user an alarm is set. */
    fun canArmAlarm(items: List<ChecklistItem>): Boolean =
        items.none { it.blocking && !it.granted }

    /**
     * Whether the alarm will work but not well — a warning, not a block.
     * Worth surfacing once, without nagging: a user who has said no twice to
     * notifications does not need a third screen about it.
     */
    fun isDegraded(items: List<ChecklistItem>): Boolean =
        canArmAlarm(items) && items.any { !it.granted }

    /** The next thing to ask for, or null when there is nothing left. */
    fun nextToRequest(items: List<ChecklistItem>): Permission? =
        items.firstOrNull { !it.granted }?.permission
}
