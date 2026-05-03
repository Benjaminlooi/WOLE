package com.anonymous.wolrelay

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat

class WolHttpServerService : Service() {
    private var server: WolServer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())

    // Heartbeat: log every 15 minutes to prove service is alive
    private val heartbeatIntervalMs = 15L * 60 * 1000
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            val runtime = android.os.SystemClock.elapsedRealtime()
            val uptimeMin = (runtime - serviceStartElapsed) / 60000
            val memInfo = Runtime.getRuntime()
            val usedMb = (memInfo.totalMemory() - memInfo.freeMemory()) / (1024 * 1024)
            val maxMb = memInfo.maxMemory() / (1024 * 1024)
            FileLogger.log(
                applicationContext, TAG,
                "♥ heartbeat — uptime=${uptimeMin}min, mem=${usedMb}/${maxMb}MB, " +
                        "wakeLock=${wakeLock?.isHeld}, serverAlive=${server != null}"
            )
            handler.postDelayed(this, heartbeatIntervalMs)
        }
    }
    private var serviceStartElapsed = 0L

    override fun onCreate() {
        super.onCreate()
        serviceStartElapsed = SystemClock.elapsedRealtime()
        FileLogger.log(applicationContext, TAG, "onCreate")
        logBatteryOptimizationStatus()
        acquireWakeLock()
        startInForeground()
        startHeartbeat()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("wol_prefs", MODE_PRIVATE)

        val isSystemRestart = intent == null
        if (isSystemRestart) {
            FileLogger.log(applicationContext, TAG,
                "onStartCommand: system restart (START_STICKY re-delivery)")
        } else {
            val action = intent.action ?: "explicit-start"
            FileLogger.log(applicationContext, TAG,
                "onStartCommand: action=$action, flags=$flags, startId=$startId")
        }

        var port = intent?.getIntExtra(EXTRA_PORT, -1) ?: -1
        var token = intent?.getStringExtra(EXTRA_TOKEN)

        if (port <= 0) {
            port = prefs.getInt("port", 8080)
        }
        if (token == null) {
            token = prefs.getString("token", null)
        }

        // Persist last used values (do not overwrite token with null)
        prefs.edit().apply {
            putInt("port", port)
            if (token != null) putString("token", token)
        }.apply()

        startServer(port, token)
        FileLogger.log(applicationContext, TAG, "onStartCommand: server started on port $port")
        return START_STICKY
    }

    override fun onDestroy() {
        FileLogger.log(applicationContext, TAG,
            "onDestroy — scheduling AlarmManager restart as safety net")
        stopHeartbeat()
        stopServer()
        releaseWakeLock()
        scheduleAlarmRestart()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        FileLogger.log(applicationContext, TAG, "onTaskRemoved: app swiped away, restarting service")
        performSelfRestart()
        super.onTaskRemoved(rootIntent)
    }

    /**
     * Safety net for Android 15+ (API 35): if the system ever sends a timeout signal
     * (e.g. for dataSync type which has a 6-hour limit), gracefully self-restart 
     * instead of letting the system crash the app.
     */
    override fun onTimeout(startId: Int, fgsType: Int) {
        FileLogger.logWarning(applicationContext, TAG,
            "⚠ onTimeout received (startId=$startId, fgsType=$fgsType) — performing self-restart to reset timer")
        performSelfRestart()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        val levelName = when (level) {
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE -> "RUNNING_MODERATE"
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> "RUNNING_LOW"
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> "RUNNING_CRITICAL"
            ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN -> "UI_HIDDEN"
            ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> "BACKGROUND"
            ComponentCallbacks2.TRIM_MEMORY_MODERATE -> "MODERATE"
            ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> "COMPLETE"
            else -> "UNKNOWN($level)"
        }
        FileLogger.logWarning(applicationContext, TAG,
            "⚠ onTrimMemory: level=$levelName — system is reclaiming memory")
    }

    override fun onLowMemory() {
        super.onLowMemory()
        FileLogger.logWarning(applicationContext, TAG,
            "⚠ onLowMemory: system is critically low on memory, service may be killed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startServer(port: Int, token: String?) {
        if (server == null) {
            try {
                server = WolServer(applicationContext, port = port, sharedToken = token)
                server?.start()
                FileLogger.log(applicationContext, TAG, "NanoHTTPD server started on port $port")
            } catch (e: Exception) {
                FileLogger.logError(applicationContext, TAG,
                    "Failed to start NanoHTTPD server on port $port", e)
            }
        }
    }

    private fun stopServer() {
        try {
            server?.stop()
            FileLogger.log(applicationContext, TAG, "NanoHTTPD server stopped")
        } catch (e: Exception) {
            FileLogger.logError(applicationContext, TAG, "Error stopping NanoHTTPD server", e)
        }
        server = null
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            try {
                val pm = getSystemService(POWER_SERVICE) as PowerManager
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WOLE::WolServerLock")
                // Use a very long timeout instead of indefinite to avoid OEM-specific kills
                wakeLock?.acquire(Long.MAX_VALUE)
                FileLogger.log(applicationContext, TAG,
                    "Wake lock acquired (timeout=Long.MAX_VALUE)")
            } catch (e: Exception) {
                FileLogger.logError(applicationContext, TAG, "Failed to acquire wake lock", e)
            }
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                FileLogger.log(applicationContext, TAG, "Wake lock released")
            } else {
                FileLogger.logWarning(applicationContext, TAG,
                    "Wake lock was NOT held when release was attempted — may have been revoked by system")
            }
        }
        wakeLock = null
    }

    private fun logBatteryOptimizationStatus() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            val isIgnoring = pm.isIgnoringBatteryOptimizations(packageName)
            FileLogger.log(applicationContext, TAG,
                "Battery optimization ignored: $isIgnoring (should be true for reliable background)")
        } catch (e: Exception) {
            FileLogger.logError(applicationContext, TAG, "Could not check battery optimization status", e)
        }
    }

    private fun startHeartbeat() {
        handler.postDelayed(heartbeatRunnable, heartbeatIntervalMs)
    }

    private fun stopHeartbeat() {
        handler.removeCallbacks(heartbeatRunnable)
    }

    /**
     * Restart the service: stop current server, release wake lock, then start a fresh service.
     * This resets the foreground service type timer.
     */
    private fun performSelfRestart() {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences("wol_prefs", MODE_PRIVATE)
        val port = prefs.getInt("port", 8080)
        val token = prefs.getString("token", null)

        val restartIntent = Intent(ctx, WolHttpServerService::class.java).apply {
            action = ACTION_SELF_RESTART
            putExtra(EXTRA_PORT, port)
            putExtra(EXTRA_TOKEN, token)
        }

        // Stop current instance cleanly
        stopHeartbeat()
        stopServer()
        releaseWakeLock()

        // Start a fresh instance
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(restartIntent)
        } else {
            ctx.startService(restartIntent)
        }

        // Stop current service instance
        stopSelf()
    }

    /**
     * Schedule an AlarmManager restart as a last-resort safety net.
     * If the system kills the service and START_STICKY doesn't bring it back quickly,
     * the alarm will restart it within ~1 minute.
     */
    private fun scheduleAlarmRestart() {
        try {
            val ctx = applicationContext
            val prefs = ctx.getSharedPreferences("wol_prefs", MODE_PRIVATE)
            val shouldAutostart = prefs.getBoolean("autostart", false)
            if (!shouldAutostart) {
                FileLogger.log(ctx, TAG,
                    "Autostart is disabled, skipping AlarmManager restart")
                return
            }

            val restartIntent = Intent(ctx, WolHttpServerService::class.java).apply {
                action = ACTION_ALARM_RESTART
            }
            val pendingIntent = PendingIntent.getForegroundService(
                ctx, ALARM_REQUEST_CODE, restartIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val triggerAt = SystemClock.elapsedRealtime() + 60_000  // 1 minute from now
            am.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAt,
                pendingIntent
            )
            FileLogger.log(ctx, TAG,
                "AlarmManager restart scheduled in 60 seconds")
        } catch (e: Exception) {
            FileLogger.logError(applicationContext, TAG,
                "Failed to schedule AlarmManager restart", e)
        }
    }

    private fun startInForeground() {
        val channelId = "wol_server_channel"
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // IMPORTANCE_LOW: silent but visible in status bar — signals to OS this service matters
            val channel = NotificationChannel(channelId, "WOL Server", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Keeps the Wake-on-LAN relay running in the background"
            nm.createNotificationChannel(channel)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("WOL relay running")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        // Android 14+ (API 34) requires foregroundServiceType in startForeground()
        // Use dataSync type — has a 6h limit on Android 15+ which we handle in onTimeout()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val TAG = "WolHttpServerService"
        const val EXTRA_PORT = "port"
        const val EXTRA_TOKEN = "token"
        const val NOTIFICATION_ID = 1001
        const val ALARM_REQUEST_CODE = 2001
        const val ACTION_SELF_RESTART = "com.anonymous.wolrelay.SELF_RESTART"
        const val ACTION_ALARM_RESTART = "com.anonymous.wolrelay.ALARM_RESTART"
    }
}
