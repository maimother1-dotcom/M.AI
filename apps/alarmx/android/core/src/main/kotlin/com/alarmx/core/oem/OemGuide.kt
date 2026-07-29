package com.alarmx.core.oem

/**
 * Getting past the OEM battery killers. PRD 9 — the single biggest technical
 * risk in this product.
 *
 * On stock Android, an alarm scheduled with `setAlarmClock` is exempt from Doze
 * and rings. On the phones this product actually targets — Redmi, Realme, Vivo,
 * the budget half of the Indian market — the manufacturer adds a second
 * aggressive layer on top: autostart lists, "app battery saver", and a memory
 * cleaner that kills backgrounded apps outright. None of it is exposed through
 * a permission the app can request. It can only be switched off by the user, in
 * a settings screen most users do not know exists.
 *
 * An alarm app that does not walk the user through this ships broken on the
 * majority of its market and gets one-star reviews saying "alarm did not ring".
 *
 * **The deep links here are best effort and must be treated as such.** The
 * component names change between OS versions and regional builds, so the
 * Android layer must check whether each target resolves and fall back to
 * [OemStep.fallbackToBatterySettings] when it does not. Never assume a launch
 * succeeded: the checklist item stays unconfirmed until the user says so.
 */

/** A settings screen to send the user to, as raw strings so `core` stays Android-free. */
data class SettingsTarget(val packageName: String, val className: String)

/**
 * One thing the user has to change, in the order it should be presented.
 *
 * [why] exists because users refuse steps they do not understand, and this one
 * asks them to weaken a battery setting on a budget phone. Saying "so your
 * alarm actually rings" converts; "grant autostart permission" does not.
 */
data class OemStep(
    val id: StepId,
    val title: String,
    val why: String,
    val target: SettingsTarget?,
    /** When the target does not resolve, send the user to generic battery settings. */
    val fallbackToBatterySettings: Boolean = true,
)

enum class StepId { AUTOSTART, BATTERY_SAVER, LOCK_IN_RECENTS, NOTIFICATIONS }

enum class Oem { XIAOMI, REALME_OPPO, VIVO, SAMSUNG, ONEPLUS, HUAWEI, OTHER }

object OemGuide {

    /**
     * Map `Build.MANUFACTURER` to a family.
     *
     * Matching is lowercase and substring based because the field is not
     * standardised: Redmi and Poco phones report "Xiaomi", "Redmi" or "POCO"
     * depending on the model, and Realme devices report "realme" lowercase.
     */
    fun detect(manufacturer: String, brand: String = ""): Oem {
        val s = "${manufacturer.lowercase()} ${brand.lowercase()}"
        return when {
            listOf("xiaomi", "redmi", "poco").any { it in s } -> Oem.XIAOMI
            listOf("realme", "oppo").any { it in s } -> Oem.REALME_OPPO
            "vivo" in s || "iqoo" in s -> Oem.VIVO
            "samsung" in s -> Oem.SAMSUNG
            "oneplus" in s -> Oem.ONEPLUS
            listOf("huawei", "honor").any { it in s } -> Oem.HUAWEI
            else -> Oem.OTHER
        }
    }

    /** True when this device needs the extra walkthrough at all. */
    fun needsWalkthrough(oem: Oem): Boolean = oem != Oem.OTHER

    fun stepsFor(oem: Oem): List<OemStep> = when (oem) {
        Oem.XIAOMI -> listOf(
            OemStep(
                StepId.AUTOSTART,
                "Autostart on karo",
                "Iske bina phone AlarmX ko band kar dega aur alarm nahi bajega.",
                SettingsTarget(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity",
                ),
            ),
            OemStep(
                StepId.BATTERY_SAVER,
                "Battery saver: No restrictions",
                "MIUI default 'Restricted' hai, jo alarm ko rok deta hai.",
                SettingsTarget(
                    "com.miui.powerkeeper",
                    "com.miui.powerkeeper.ui.HiddenAppsConfigActivity",
                ),
            ),
            OemStep(
                StepId.LOCK_IN_RECENTS,
                "Recents me app ko lock karo",
                "Recents me AlarmX pe niche swipe karke lock. Memory cleaner ise nahi marega.",
                null,
                fallbackToBatterySettings = false,
            ),
        )

        Oem.REALME_OPPO -> listOf(
            OemStep(
                StepId.AUTOSTART,
                "Auto-launch allow karo",
                "ColorOS band app ko chalne nahi deta. Alarm miss ho jayega.",
                SettingsTarget(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity",
                ),
            ),
            OemStep(
                StepId.BATTERY_SAVER,
                "Battery optimisation: Allow background",
                "Sleep standby optimisation alarm ko der se bajata hai ya bilkul nahi.",
                SettingsTarget(
                    "com.coloros.oppoguardelf",
                    "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity",
                ),
            ),
            OemStep(
                StepId.LOCK_IN_RECENTS,
                "Recents me lock karo",
                "Recents me AlarmX pe hold karke lock icon dabao.",
                null,
                fallbackToBatterySettings = false,
            ),
        )

        Oem.VIVO -> listOf(
            OemStep(
                StepId.AUTOSTART,
                "Background me chalne do",
                "Funtouch OS by default band kar deta hai.",
                SettingsTarget(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
                ),
            ),
            OemStep(
                StepId.BATTERY_SAVER,
                "High background power ki permission do",
                "Iske bina screen off hone ke baad alarm mar jata hai.",
                SettingsTarget(
                    "com.vivo.abe",
                    "com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity",
                ),
            ),
        )

        Oem.SAMSUNG -> listOf(
            OemStep(
                StepId.BATTERY_SAVER,
                "Sleeping apps se hatao",
                "One UI 3 din baad app ko 'deep sleep' me daal deta hai aur alarm ruk jata hai.",
                SettingsTarget(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.BatteryActivity",
                ),
            ),
            OemStep(
                StepId.AUTOSTART,
                "Adaptive battery off karo",
                "Adaptive battery kam use hone wale app ka alarm rok deti hai.",
                null,
            ),
        )

        Oem.ONEPLUS -> listOf(
            OemStep(
                StepId.AUTOSTART,
                "Auto-launch on karo",
                "OxygenOS advanced optimisation alarm ko rokta hai.",
                SettingsTarget(
                    "com.oneplus.security",
                    "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
                ),
            ),
            OemStep(
                StepId.BATTERY_SAVER,
                "Battery optimisation: Don't optimise",
                "Deep optimisation background alarm ko band kar deta hai.",
                null,
            ),
        )

        Oem.HUAWEI -> listOf(
            OemStep(
                StepId.AUTOSTART,
                "Manage manually on karo",
                "EMUI ka app launch manager alarm ko band karta hai.",
                SettingsTarget(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                ),
            ),
        )

        Oem.OTHER -> emptyList()
    } + notificationStep(oem)

    /**
     * Notifications are last on purpose. It is the one step stock Android also
     * needs, and asking for the unfamiliar manufacturer settings first means the
     * user has already agreed to something harder by the time it appears.
     */
    private fun notificationStep(oem: Oem): List<OemStep> =
        if (oem == Oem.OTHER) emptyList() else listOf(
            OemStep(
                StepId.NOTIFICATIONS,
                "Notifications allow karo",
                "Alarm screen aur daily reminder isi se aata hai.",
                null,
                fallbackToBatterySettings = false,
            ),
        )
}
