package com.alarmx.core

/**
 * The share of realised ad revenue the user is paid. PRD 2.
 *
 * Expressed in **basis points** so the tier itself is an exact integer and the
 * entitlement calculation never touches a float.
 *
 * The share rises with loyalty and never with a promise. If ad revenue grows,
 * earnings grow automatically and nobody has to be told a new number.
 */
enum class ShareTier(val basisPoints: Int) {
    /** Days 1-6. The base deal: half of what your attention earns. */
    BASE(5000),

    /** Day 7+ streak. Retention, costing nothing that was not already earned. */
    STREAK_7(5500),

    /** Day 30+ streak. The worst case for the business, and what profit is tested against. */
    STREAK_30(6000),

    /**
     * Until lifetime earnings reach the first payout threshold.
     * Booked as acquisition, not reward — PRD 6.2. Brings the first real
     * payout to about eleven days at base rather than six weeks.
     */
    ACQUISITION(7000);

    val percent: Double get() = basisPoints / 100.0
}

/**
 * Which tier applies. **Server-authoritative** — PRD 8.3 and 18.5. The client
 * renders this; it never sends its own tier.
 */
object ShareLadder {

    /** Lifetime earnings below this stay on the acquisition boost. PRD 6.2. */
    val FIRST_PAYOUT_THRESHOLD = Paise.ofRupees(10)

    fun tierFor(lifetimeEarned: Paise, streakDays: Int): ShareTier {
        require(streakDays >= 0) { "streak cannot be negative" }
        return when {
            lifetimeEarned < FIRST_PAYOUT_THRESHOLD -> ShareTier.ACQUISITION
            streakDays >= 30 -> ShareTier.STREAK_30
            streakDays >= 7 -> ShareTier.STREAK_7
            else -> ShareTier.BASE
        }
    }

    /** The next tier a user can reach, and how many more streak days it needs. */
    fun nextTier(lifetimeEarned: Paise, streakDays: Int): Pair<ShareTier, Int>? = when {
        lifetimeEarned < FIRST_PAYOUT_THRESHOLD -> null   // already on the highest share
        streakDays < 7 -> ShareTier.STREAK_7 to (7 - streakDays)
        streakDays < 30 -> ShareTier.STREAK_30 to (30 - streakDays)
        else -> null
    }

    /**
     * Entitlement in micropaise for one verified view.
     *
     * [grossMicropaise] is the realised value reported by the ad network, not a
     * hardcoded eCPM. If the network reports zero the user earns zero, which is
     * the entire safety property — PRD 2.
     *
     * [spinBonusBasisPoints] is the one-day multiplier from the spin (PRD 4.3).
     * It multiplies money that already arrived, so even the jackpot cannot pay
     * out revenue that never existed.
     */
    fun entitlementMicropaise(
        grossMicropaise: Long,
        tier: ShareTier,
        spinBonusBasisPoints: Int = 0,
    ): Long {
        require(grossMicropaise >= 0) { "gross cannot be negative" }
        require(spinBonusBasisPoints in 0..10_000) { "spin bonus out of range" }
        val effective = tier.basisPoints.toLong() * (10_000L + spinBonusBasisPoints)
        // Two basis-point factors, so divide by 10_000 twice. Integer throughout.
        return grossMicropaise * effective / 10_000L / 10_000L
    }
}
