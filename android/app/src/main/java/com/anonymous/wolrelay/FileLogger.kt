package com.anonymous.wolrelay

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileWriter
import java.io.PrintWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object FileLogger {
    private const val FILE_NAME = "wol_logs.txt"
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    fun log(context: Context, tag: String, message: String) {
        val timestamp = dateFormat.format(Date())
        val logMessage = "$timestamp [$tag] $message"
        Log.d(tag, message) // Also log to Logcat
        appendToFile(context, logMessage)
    }

    fun logError(context: Context, tag: String, message: String, e: Throwable?) {
        val timestamp = dateFormat.format(Date())
        val stackTrace = e?.stackTraceToString() ?: ""
        val logMessage = "$timestamp [$tag] ERROR: $message\n$stackTrace"
        Log.e(tag, message, e) // Also log to Logcat
        appendToFile(context, logMessage)
    }

    private fun appendToFile(context: Context, text: String) {
        try {
            val file = File(context.getExternalFilesDir(null), FILE_NAME)
            FileWriter(file, true).use { writer ->
                PrintWriter(writer).use { out ->
                    out.println(text)
                }
            }
        } catch (e: Exception) {
            Log.e("FileLogger", "Failed to write to log file", e)
        }
    }

    fun getLogs(context: Context): String {
        return try {
            val file = File(context.getExternalFilesDir(null), FILE_NAME)
            if (file.exists()) {
                file.readText()
            } else {
                "No logs found."
            }
        } catch (e: Exception) {
            "Error reading logs: ${e.message}"
        }
    }
    
    fun clearLogs(context: Context) {
        try {
            val file = File(context.getExternalFilesDir(null), FILE_NAME)
            if (file.exists()) {
                file.delete()
            }
        } catch (e: Exception) {
            Log.e("FileLogger", "Failed to clear logs", e)
        }
    }
}
