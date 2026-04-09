package expo.modules.flashlighttools

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FlashlightToolsModule : Module() {
  private var isOn = false

  private fun getCameraManager(): CameraManager {
    val context = appContext.reactContext ?: throw Exception("Context not available")
    return context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  }

  private fun getCameraId(): String {
    val cm = getCameraManager()
    for (id in cm.cameraIdList) {
      val chars = cm.getCameraCharacteristics(id)
      val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) ?: false
      if (hasFlash) return id
    }
    throw Exception("No flash available on this device")
  }

  override fun definition() = ModuleDefinition {
    Name("FlashlightTools")

    Function("hasFlash") {
      try {
        getCameraId()
        true
      } catch (_: Exception) {
        false
      }
    }

    Function("turnOn") {
      val cm = getCameraManager()
      val id = getCameraId()
      cm.setTorchMode(id, true)
      isOn = true
    }

    Function("turnOff") {
      val cm = getCameraManager()
      val id = getCameraId()
      cm.setTorchMode(id, false)
      isOn = false
    }

    Function("isOn") {
      isOn
    }

    // Returns max brightness level, 0 if not supported
    Function("getMaxBrightness") {
      if (Build.VERSION.SDK_INT >= 33) {
        try {
          val cm = getCameraManager()
          val id = getCameraId()
          val chars = cm.getCameraCharacteristics(id)
          val maxLevel = chars.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL)
          maxLevel ?: 0
        } catch (_: Exception) {
          0
        }
      } else {
        0
      }
    }

    Function("setBrightness") { level: Int ->
      if (Build.VERSION.SDK_INT >= 33) {
        val cm = getCameraManager()
        val id = getCameraId()
        cm.turnOnTorchWithStrengthLevel(id, level)
        isOn = true
      } else {
        throw Exception("Brightness control requires Android 13+")
      }
    }

    OnDestroy {
      try {
        if (isOn) {
          val cm = getCameraManager()
          val id = getCameraId()
          cm.setTorchMode(id, false)
          isOn = false
        }
      } catch (_: Exception) {}
    }
  }
}
