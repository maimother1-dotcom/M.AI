package com.alarmx.app.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import com.alarmx.app.R
import com.alarmx.app.ui.RingActivity

/**
 * The foreground service that actually makes noise. PRD 3.1.
 *
 * **The alarm rings until dismissed**, to a five-minute maximum. It never
 * auto-dismisses at ten seconds — that would make AlarmX the reason someone
 * misses a shift, which is the fastest possible uninstall. The ten seconds is
 * only the *reward window*.
 *
 * Equally: nothing is shown between the alarm firing and the user being able to
 * switch it off. No ad, no interstitial, not even a spinner waiting on an ad
 * request. PRD 4.6, and the reason there is no ad code anywhere in this file.
 */
class AlarmRingService : Service() {

    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var vibrator: Vibrator? = null
    private var startedAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val alarmId = intent?.getLongExtra(AlarmScheduler.EXTRA_ALARM_ID, -1L) ?: -1L
        startedAt = System.currentTimeMillis()

        // Held so the CPU cannot sleep mid-ring. Released in onDestroy, and
        // bounded by MAX_RING_MILLIS so a bug cannot flatten the battery.
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alarmx:ring")
            .apply { acquire(MAX_RING_MILLIS) }

        startForeground(NOTIFICATION_ID, buildNotification(alarmId))
        startRinging()

        // Hard stop at five minutes. The user has clearly not heard it, and a
        // phone screaming indefinitely is its own kind of harm.
        android.os.Handler(mainLooper).postDelayed({ stopSelf() }, MAX_RING_MILLIS)
        return START_STICKY
    }

    private fun startRinging() {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)              // ignores media volume
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        player = MediaPlayer().apply {
            setAudioAttributes(attrs)
            setDataSource(this@AlarmRingService, android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI)
            isLooping = true
            prepare()
            start()
        }
        vibrator = getSystemService(Vibrator::class.java)
        vibrator?.vibrate(
            VibrationEffect.createWaveform(longArrayOf(0, 800, 400), 0),
        )
    }

    /**
     * Full-screen intent so the ring UI appears over the lock screen. On
     * Android 14+ this needs USE_FULL_SCREEN_INTENT, which is granted by
     * default for apps whose core function is alarms — but must be verified at
     * runtime rather than assumed (PRD 11).
     */
    private fun buildNotification(alarmId: Long): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Alarm", NotificationManager.IMPORTANCE_HIGH).apply {
                    setBypassDnd(true)
                    setSound(null, null)   // the service owns the sound, not the channel
                    enableVibration(false)
                },
            )
        }
        val full = PendingIntent.getActivity(
            this, alarmId.toInt(),
            Intent(this, RingActivity::class.java)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_alarm)
            .setContentTitle(getString(R.string.ringing_title))
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .setFullScreenIntent(full, true)
            .build()
    }

    /** Whether the dismissal happened inside the reward window. PRD 3.1. */
    fun dismissedWithinRewardWindow(): Boolean =
        System.currentTimeMillis() - startedAt <= REWARD_WINDOW_MILLIS

    override fun onDestroy() {
        player?.run { if (isPlaying) stop(); release() }
        player = null
        vibrator?.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "alarmx_ring"
        const val NOTIFICATION_ID = 1001
        const val REWARD_WINDOW_MILLIS = 10_000L
        const val MAX_RING_MILLIS = 5 * 60 * 1000L

        fun start(context: Context, alarmId: Long) {
            val i = Intent(context, AlarmRingService::class.java)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
            context.startForegroundService(i)
        }
    }
}
