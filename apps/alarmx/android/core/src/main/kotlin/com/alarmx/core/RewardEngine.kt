package com.alarmx.core

/**
 * A single credited or rejected ad view. Written to an immutable audit log
 * *before* the wallet is credited (PRD 8.4), and it is what the Daily Close
 * receipt is computed from — the receipt is never typed (PRD 4.8).
 */
data class LedgerEntry(
    val dayIndex: Long,
    val source: RewardSource,
    val verified: Boolean,
    val grossMicropaise: Long,
    val tier: ShareTier?,
    val credited: Paise,
    /** AdMob SSV transaction id. The idempotency key. Null when unverified. */
    val transactionId: String?,
)

enum class RewardSource { MATH_SET, DAILY_OFFER, SPIN_UNLOCK, POST_DISMISS }

/** Why a view was not credited. Every rejection is explicit and logged. */
enum class RejectReason {
    NOT_VERIFIED,        // no signed SSV callback — the core safety property
    DUPLICATE,           // same transaction id replayed
    DAILY_CEILING,       // 20 credited views a day already taken
    ALARM_NOT_COMPLETED, // earning is gated on a real wake-up (PRD 4.7)
    ACCOUNT_UNDER_REVIEW,
}

sealed interface CreditResult {
    data class Credited(val amount: Paise, val entry: LedgerEntry) : CreditResult
    data class Rejected(val reason: RejectReason, val entry: LedgerEntry?) : CreditResult
}

/**
 * User state the engine needs. In production this is one Firestore document
 * read and written inside a transaction.
 */
data class UserState(
    val lifetimeEarned: Paise = Paise.ZERO,
    val withdrawable: Paise = Paise.ZERO,
    val streakDays: Int = 0,
    val carryMicropaise: Long = 0,
    val alarmCompletedForDay: Long? = null,
    val creditedViewsToday: Int = 0,
    val currentDayIndex: Long = 0,
    val spinBonusBasisPoints: Int = 0,
    val underReview: Boolean = false,
    val seenTransactionIds: Set<String> = emptySet(),
)

/**
 * The credit engine. PRD 2 and 8.3.
 *
 * The single invariant everything else protects: **nothing is credited without
 * an ad view the server has verified**. No verification, no money. That is what
 * makes a loss on the reward line structurally impossible rather than unlikely.
 */
class RewardEngine(private val ceilingPerDay: Int = DAILY_VIEW_CEILING) {

    /**
     * @param verified true only when AdMob's signed server-side verification
     *   callback has been checked. The client cannot set this.
     * @param grossMicropaise realised value from the ad network's reporting.
     *   Zero in means zero out — that is the point.
     */
    fun credit(
        state: UserState,
        source: RewardSource,
        verified: Boolean,
        grossMicropaise: Long,
        transactionId: String?,
        serverEpochMillis: Long,
        boundary: DayBoundary,
    ): Pair<UserState, CreditResult> {
        val day = boundary.dayIndex(serverEpochMillis)

        fun reject(reason: RejectReason, log: Boolean = true): Pair<UserState, CreditResult> {
            val entry = if (log) LedgerEntry(
                dayIndex = day, source = source, verified = verified,
                grossMicropaise = if (verified) grossMicropaise else 0,
                tier = null, credited = Paise.ZERO, transactionId = transactionId,
            ) else null
            return state to CreditResult.Rejected(reason, entry)
        }

        // 1. Verification is the gate. Checked first and unconditionally.
        if (!verified) return reject(RejectReason.NOT_VERIFIED)

        // 2. Replay protection. The same signed callback arriving twice pays once.
        if (transactionId == null || transactionId in state.seenTransactionIds) {
            return reject(RejectReason.DUPLICATE)
        }

        // 3. Earning is tied to a real wake-up. PRD 4.7.
        if (state.alarmCompletedForDay != day) {
            return reject(RejectReason.ALARM_NOT_COMPLETED)
        }

        if (state.underReview) return reject(RejectReason.ACCOUNT_UNDER_REVIEW)

        // 4. Daily ceiling replaces the old monthly cap, so the app never goes
        //    dead mid-month while fraud stays bounded. PRD 2.
        if (state.creditedViewsToday >= ceilingPerDay) {
            return reject(RejectReason.DAILY_CEILING)
        }

        val tier = ShareLadder.tierFor(state.lifetimeEarned, state.streakDays)
        val entitlement = ShareLadder.entitlementMicropaise(
            grossMicropaise, tier, state.spinBonusBasisPoints,
        )
        val rounder = CarryingRounder(state.carryMicropaise)
        val payable = rounder.take(entitlement)

        val entry = LedgerEntry(
            dayIndex = day, source = source, verified = true,
            grossMicropaise = grossMicropaise, tier = tier,
            credited = payable, transactionId = transactionId,
        )
        val next = state.copy(
            lifetimeEarned = state.lifetimeEarned + payable,
            withdrawable = state.withdrawable + payable,
            carryMicropaise = rounder.carry,
            creditedViewsToday = state.creditedViewsToday + 1,
            currentDayIndex = day,
            seenTransactionIds = state.seenTransactionIds + transactionId,
        )
        return next to CreditResult.Credited(payable, entry)
    }

    companion object {
        /** PRD 2. Per day, not per month. */
        const val DAILY_VIEW_CEILING = 20
    }
}
