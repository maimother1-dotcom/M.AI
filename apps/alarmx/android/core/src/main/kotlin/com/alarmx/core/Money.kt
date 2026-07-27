package com.alarmx.core

/**
 * Money in AlarmX is **integer paise**. Never a Double, never a Float.
 *
 * PRD 18.3. A verified ad view is worth about 5.28 paise at the base share.
 * Rounding that *up* to the paisa leaks 0.72 paise per view, which is
 * Rs1.73-Rs3.45 per user per month against a Conservative-column profit of
 * Rs3.30. At the daily view ceiling it turns the whole no-loss guarantee
 * negative. So the only rounding on money is downward, and the discarded
 * fraction is carried rather than lost.
 *
 * Sub-paisa amounts are held in **micropaise** (1 paisa = 1000 micropaise).
 * That resolution is not arbitrary: one view is worth Rs0.1056, which is 10.56
 * paise — not a whole number of paise, and not a whole number of tenths of a
 * paisa either. Micropaise makes it exactly 10_560, so no float is ever needed
 * and no precision is lost before the deliberate downward rounding.
 */
@JvmInline
value class Paise(val value: Long) : Comparable<Paise> {

    init {
        require(value >= 0) { "money cannot be negative: $value paise" }
    }

    operator fun plus(other: Paise) = Paise(value + other.value)

    /** Subtraction that cannot silently go negative — a payout must never overdraw. */
    operator fun minus(other: Paise): Paise {
        require(value >= other.value) { "insufficient balance: $value - ${other.value}" }
        return Paise(value - other.value)
    }

    override fun compareTo(other: Paise) = value.compareTo(other.value)

    /** Display only. Never feed this back into a calculation. */
    fun toRupeeString(): String = "%d.%02d".format(value / 100, value % 100)

    companion object {
        val ZERO = Paise(0)
        fun ofRupees(rupees: Long) = Paise(rupees * 100)
    }
}

/**
 * Converts a stream of sub-paisa entitlements into whole paise without ever
 * overpaying and without losing the remainder.
 *
 * Not thread-safe by design: in production one instance belongs to one user
 * document and is mutated inside a transaction, so the carry cannot be lost to
 * a concurrent write. See PRD 8.3.
 */
class CarryingRounder(carryMicropaise: Long = 0) {

    var carry: Long = carryMicropaise
        private set

    init {
        require(carry in 0 until MICROPAISE_PER_PAISA) {
            "carry must be a sub-paisa remainder, got $carry"
        }
    }

    /**
     * Adds [micropaise] of entitlement and returns the whole paise now payable.
     * The leftover stays in [carry] until it reaches a full paisa.
     */
    fun take(micropaise: Long): Paise {
        require(micropaise >= 0) { "entitlement cannot be negative" }
        val pool = carry + micropaise
        val paise = pool / MICROPAISE_PER_PAISA
        carry = pool % MICROPAISE_PER_PAISA
        return Paise(paise)
    }

    companion object {
        const val MICROPAISE_PER_PAISA = 1000L

        /** Realised value of one verified rewarded view in the Base column. */
        const val VIEW_GROSS_MICROPAISE = 10_560L
    }
}
