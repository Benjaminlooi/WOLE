package com.anonymous.wolrelay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class WolHttpServerService : Service() {
    private var server: WolServer? = null

    override fun onCreate() {
        super.onCreate()
        startInForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("wol_prefs", MODE_PRIVATE)

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
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopServer()
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

        startForeground(NOTIFICATION_ID, notification)
    }

    companion object {
        const val EXTRA_PORT = "port"
        const val EXTRA_TOKEN = "token"
        const val NOTIFICATION_ID = 1001
    }
}
