package expo.modules.appcachemanager

import android.app.AppOpsManager
import android.app.usage.StorageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Process
import android.os.storage.StorageManager
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class AppCacheManagerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AppCacheManager")

    Function("hasUsagePermission") {
      val context = appContext.reactContext ?: return@Function false
      val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
      mode == AppOpsManager.MODE_ALLOWED
    }

    Function("openUsagePermissionSettings") {
      val context = appContext.reactContext ?: throw Exception("Context not available")
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    AsyncFunction("getInstalledApps") {
      val context = appContext.reactContext ?: throw Exception("Context not available")
      val pm = context.packageManager
      val storageStatsManager = context.getSystemService(Context.STORAGE_STATS_SERVICE) as StorageStatsManager
      val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager

      val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
      val apps = mutableListOf<Map<String, Any>>()

      for (appInfo in packages) {
        // Skip system apps that aren't updated
        val isSystemApp = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        val isUpdatedSystem = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
        if (isSystemApp && !isUpdatedSystem) continue

        try {
          val packageName = appInfo.packageName
          val appName = pm.getApplicationLabel(appInfo).toString()
          val uuid = storageManager.getUuidForPath(context.filesDir)
          val stats = storageStatsManager.queryStatsForPackage(uuid, packageName, Process.myUserHandle())

          val cacheSize = stats.cacheBytes
          val dataSize = stats.dataBytes
          val appSize = stats.appBytes

          // Get app icon as base64
          val iconBase64 = try {
            val drawable = pm.getApplicationIcon(appInfo)
            val bitmap = if (drawable is BitmapDrawable) {
              drawable.bitmap
            } else {
              val bmp = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888)
              val canvas = Canvas(bmp)
              drawable.setBounds(0, 0, 48, 48)
              drawable.draw(canvas)
              bmp
            }
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 80, stream)
            Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
          } catch (_: Exception) { "" }

          apps.add(mapOf(
            "packageName" to packageName,
            "appName" to appName,
            "cacheSize" to cacheSize,
            "dataSize" to dataSize,
            "appSize" to appSize,
            "icon" to iconBase64
          ))
        } catch (_: Exception) {
          // Skip apps we can't get stats for
        }
      }

      // Sort by cache size descending
      apps.sortByDescending { it["cacheSize"] as Long }
      apps
    }

    Function("openAppSettings") { packageName: String ->
      val context = appContext.reactContext ?: throw Exception("Context not available")
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:$packageName")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }
}
