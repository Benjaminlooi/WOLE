package com.anonymous.wolrelay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
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

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = reactContext.packageName
            promise.resolve(pm.isIgnoringBatteryOptimizations(packageName))
        } catch (e: Exception) {
            promise.reject("BATTERY_CHECK_ERROR", e)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BATTERY_REQUEST_ERROR", e)
        }
    }

    @ReactMethod
    fun getLogs(promise: Promise) {
        try {
            val logs = FileLogger.getLogs(reactContext.applicationContext)
            promise.resolve(logs)
        } catch (e: Exception) {
            promise.reject("GET_LOGS_ERROR", e)
        }
    }

    @ReactMethod
    fun clearLogs(promise: Promise) {
        try {
            FileLogger.clearLogs(reactContext.applicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_LOGS_ERROR", e)
        }
    }

    @ReactMethod
    fun getAutoStartConfig(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("wol_prefs", Context.MODE_PRIVATE)
            val autostart = prefs.getBoolean("autostart", false)
            val port = prefs.getInt("port", 8080)
            val token = prefs.getString("token", null)

            val map = com.facebook.react.bridge.Arguments.createMap()
            map.putBoolean("autostart", autostart)
            map.putInt("port", port)
            if (token != null) {
                map.putString("token", token)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("GET_CONFIG_ERROR", e)
        }
    }
}
