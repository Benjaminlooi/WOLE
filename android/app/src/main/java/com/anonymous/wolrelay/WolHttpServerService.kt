package com.anonymous.wolrelay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class WolHttpServerService : Service() {
    private var server: WolServer? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        FileLogger.log(applicationContext, "WolHttpServerService", "onCreate")
        acquireWakeLock()
        startInForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("wol_prefs", MODE_PRIVATE)

        val isSystemRestart = intent == null
        if (isSystemRestart) {
            FileLogger.log(applicationContext, "WolHttpServerService", "onStartCommand: system restart (START_STICKY)")
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
        FileLogger.log(applicationContext, "WolHttpServerService", "onStartCommand: started server on port $port")
        return START_STICKY
    }

    override fun onDestroy() {
        FileLogger.log(applicationContext, "WolHttpServerService", "onDestroy")
        stopServer()
        releaseWakeLock()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        FileLogger.log(applicationContext, "WolHttpServerService", "onTaskRemoved: restarting service")
        // Re-start ourselves so the service survives swipe-away
        val restartIntent = Intent(applicationContext, WolHttpServerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(restartIntent)
        } else {
            applicationContext.startService(restartIntent)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startServer(port: Int, token: String?) {
        if (server == null) {
            server = WolServer(applicationContext, port = port, sharedToken = token)
            server?.start()
        }
    }

    private fun stopServer() {
        server?.stop()
        server = null
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WOLE::WolServerLock")
            wakeLock?.acquire()
            FileLogger.log(applicationContext, "WolHttpServerService", "Wake lock acquired")
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                FileLogger.log(applicationContext, "WolHttpServerService", "Wake lock released")
            }
        }
        wakeLock = null
    }

    private fun startInForeground() {
        val channelId = "wol_server_channel"
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "WOL Server", NotificationManager.IMPORTANCE_MIN)
            nm.createNotificationChannel(channel)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("WOL server running")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()

        // Android 14+ (API 34) requires foregroundServiceType in startForeground()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val EXTRA_PORT = "port"
        const val EXTRA_TOKEN = "token"
        const val NOTIFICATION_ID = 1001
    }
}
