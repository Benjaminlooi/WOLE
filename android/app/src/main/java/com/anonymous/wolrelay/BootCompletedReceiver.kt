package com.anonymous.wolrelay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences("wol_prefs", Context.MODE_PRIVATE)
        val shouldAutostart = prefs.getBoolean("autostart", false)
        if (!shouldAutostart) return

        val port = prefs.getInt("port", 8080)
        val token = prefs.getString("token", null)

        val serviceIntent = Intent(context, WolHttpServerService::class.java).apply {
            putExtra(WolHttpServerService.EXTRA_PORT, port)
            putExtra(WolHttpServerService.EXTRA_TOKEN, token)
        }
        // Start the foreground service on boot
        ContextCompat.startForegroundService(context, serviceIntent)
    }
}
