package com.anonymous.wolrelay

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WolModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "WolServerModule"

    @ReactMethod
    fun start(port: Int, token: String?, promise: Promise) {
        try {
            val ctx: Context = reactContext.applicationContext
            val intent = Intent(ctx, WolHttpServerService::class.java).apply {
                putExtra(WolHttpServerService.EXTRA_PORT, port)
                putExtra(WolHttpServerService.EXTRA_TOKEN, token)
            }
            ctx.startForegroundService(intent)
            // Persist settings for potential auto-start
            val prefs = reactContext.getSharedPreferences("wol_prefs", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean("autostart", true)
                putInt("port", port)
                if (token != null) putString("token", token)
            }.apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            val ctx: Context = reactContext.applicationContext
            val intent = Intent(ctx, WolHttpServerService::class.java)
            ctx.stopService(intent)
            // Disable autostart when explicitly stopped
            val prefs = reactContext.getSharedPreferences("wol_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("autostart", false).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e)
        }
    }
}
