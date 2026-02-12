package com.anonymous.wolrelay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        FileLogger.log(context, "BootCompletedReceiver", "onReceive: action=${intent?.action}")
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences("wol_prefs", Context.MODE_PRIVATE)
        val shouldAutostart = prefs.getBoolean("autostart", false)
        if (!shouldAutostart) {
            FileLogger.log(context, "BootCompletedReceiver", "Autostart disabled, skipping service start")
            return
        }

        val port = prefs.getInt("port", 8080)
        val token = prefs.getString("token", null)

        val serviceIntent = Intent(context, WolHttpServerService::class.java).apply {
            putExtra(WolHttpServerService.EXTRA_PORT, port)
            putExtra(WolHttpServerService.EXTRA_TOKEN, token)
        }

        // Use goAsync() to extend the receiver's lifecycle and allow foreground service start
        val pendingResult = goAsync()
        
        try {
            // Start the foreground service on boot
            ContextCompat.startForegroundService(context, serviceIntent)
            FileLogger.log(context, "BootCompletedReceiver", "Successfully started foreground service")
        } catch (e: Exception) {
            // On Android 12+, starting foreground services from background may be restricted
            FileLogger.log(context, "BootCompletedReceiver", "Failed to start service: ${e.message}")
        } finally {
            // Finish async work
            pendingResult.finish()
        }
    }
}
