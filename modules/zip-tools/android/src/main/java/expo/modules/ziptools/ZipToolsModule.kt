package expo.modules.ziptools

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import net.lingala.zip4j.ZipFile
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.CompressionLevel
import net.lingala.zip4j.model.enums.CompressionMethod
import net.lingala.zip4j.model.enums.EncryptionMethod
import java.io.File
import java.io.FileOutputStream

class ZipToolsModule : Module() {

  private fun copyContentUriToTemp(contentUri: String, fileName: String): File {
    val context = appContext.reactContext ?: throw Exception("No context")
    val uri = Uri.parse(contentUri)
    val tempFile = File(context.cacheDir, "zip_input_${System.currentTimeMillis()}_$fileName")
    val inputStream = context.contentResolver.openInputStream(uri)
      ?: throw Exception("Could not open file")
    val outputStream = FileOutputStream(tempFile)
    inputStream.copyTo(outputStream)
    inputStream.close()
    outputStream.close()
    return tempFile
  }

  override fun definition() = ModuleDefinition {
    Name("ZipTools")

    // createZipWithPassword(filePaths[], fileNames[], password, outputPath) -> { path, size, fileCount }
    AsyncFunction("createZipWithPassword") { filePaths: List<String>, fileNames: List<String>, password: String, outputPath: String, promise: Promise ->
      Thread {
        try {
          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val zipFile = ZipFile(outputFile, password.toCharArray())
          val zipParams = ZipParameters()
          zipParams.compressionMethod = CompressionMethod.DEFLATE
          zipParams.compressionLevel = CompressionLevel.NORMAL
          zipParams.isEncryptFiles = true
          zipParams.encryptionMethod = EncryptionMethod.ZIP_STANDARD

          val tempFiles = mutableListOf<File>()

          for (i in filePaths.indices) {
            val path = filePaths[i]
            val name = if (i < fileNames.size) fileNames[i] else "file_${i + 1}"
            val uri = Uri.parse(path)

            val file: File
            if (uri.scheme == "content") {
              file = copyContentUriToTemp(path, name)
              tempFiles.add(file)
            } else {
              val rawPath = path.replace("file://", "")
              file = File(rawPath)
            }

            zipParams.fileNameInZip = name
            zipFile.addFile(file, zipParams)
          }

          // Cleanup temp files
          tempFiles.forEach { it.delete() }

          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "fileCount" to filePaths.size
          ))
        } catch (e: Exception) {
          promise.reject("ERR_ZIP_CREATE", "Failed to create ZIP: ${e.message}", e)
        }
      }.start()
    }

    // unzipWithPassword(zipPath, password, outputDir) -> { paths[], names[], sizes[], fileCount }
    AsyncFunction("unzipWithPassword") { zipPath: String, password: String, outputDir: String, promise: Promise ->
      Thread {
        try {
          val outDir = File(outputDir)
          outDir.mkdirs()

          // Handle content:// URIs
          val uri = Uri.parse(zipPath)
          val actualFile: File
          var tempFile: File? = null

          if (uri.scheme == "content") {
            val context = appContext.reactContext ?: throw Exception("No context")
            tempFile = File(context.cacheDir, "zip_temp_${System.currentTimeMillis()}.zip")
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            val outputStream = FileOutputStream(tempFile)
            inputStream.copyTo(outputStream)
            inputStream.close()
            outputStream.close()
            actualFile = tempFile
          } else {
            actualFile = File(zipPath.replace("file://", ""))
          }

          val zipFile = ZipFile(actualFile)

          if (zipFile.isEncrypted) {
            zipFile.setPassword(password.toCharArray())
          }

          zipFile.extractAll(outDir.absolutePath)

          // Cleanup temp
          tempFile?.delete()

          // Collect extracted file info
          val paths = mutableListOf<String>()
          val names = mutableListOf<String>()
          val sizes = mutableListOf<Long>()

          fun collectFiles(dir: File) {
            dir.listFiles()?.forEach { file ->
              if (file.isFile) {
                paths.add(file.absolutePath)
                names.add(file.name)
                sizes.add(file.length())
              } else if (file.isDirectory) {
                collectFiles(file)
              }
            }
          }
          collectFiles(outDir)

          promise.resolve(mapOf(
            "paths" to paths,
            "names" to names,
            "sizes" to sizes,
            "fileCount" to paths.size
          ))
        } catch (e: Exception) {
          val msg = e.message ?: ""
          if (msg.contains("Wrong password", ignoreCase = true) || msg.contains("invalid", ignoreCase = true)) {
            promise.reject("ERR_WRONG_PASSWORD", "Incorrect password", e)
          } else {
            promise.reject("ERR_UNZIP", "Failed to unzip: ${e.message}", e)
          }
        }
      }.start()
    }

    // lockZip(zipPath, password, outputPath) -> { path, size, fileCount }
    AsyncFunction("lockZip") { zipPath: String, password: String, outputPath: String, promise: Promise ->
      Thread {
        try {
          val uri = Uri.parse(zipPath)
          val actualFile: File
          var tempFile: File? = null

          if (uri.scheme == "content") {
            val context = appContext.reactContext ?: throw Exception("No context")
            tempFile = File(context.cacheDir, "zip_lock_${System.currentTimeMillis()}.zip")
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            val outputStream = FileOutputStream(tempFile)
            inputStream.copyTo(outputStream)
            inputStream.close()
            outputStream.close()
            actualFile = tempFile
          } else {
            actualFile = File(zipPath.replace("file://", ""))
          }

          // Extract to temp dir
          val context = appContext.reactContext ?: throw Exception("No context")
          val tempDir = File(context.cacheDir, "zip_lock_extract_${System.currentTimeMillis()}")
          tempDir.mkdirs()

          val sourceZip = ZipFile(actualFile)
          if (sourceZip.isEncrypted) {
            throw Exception("ZIP is already encrypted")
          }
          sourceZip.extractAll(tempDir.absolutePath)

          // Collect all files
          val files = mutableListOf<File>()
          fun collectFiles(dir: File) {
            dir.listFiles()?.forEach { file ->
              if (file.isFile) {
                files.add(file)
              } else if (file.isDirectory) {
                collectFiles(file)
              }
            }
          }
          collectFiles(tempDir)

          // Create new encrypted ZIP
          val outputFile = File(outputPath)
          outputFile.parentFile?.mkdirs()
          if (outputFile.exists()) outputFile.delete()

          val newZip = ZipFile(outputFile, password.toCharArray())
          val zipParams = ZipParameters()
          zipParams.compressionMethod = CompressionMethod.DEFLATE
          zipParams.compressionLevel = CompressionLevel.NORMAL
          zipParams.isEncryptFiles = true
          zipParams.encryptionMethod = EncryptionMethod.ZIP_STANDARD

          for (file in files) {
            val relativePath = file.absolutePath.removePrefix(tempDir.absolutePath + "/")
            zipParams.fileNameInZip = relativePath
            newZip.addFile(file, zipParams)
          }

          // Cleanup
          tempFile?.delete()
          tempDir.deleteRecursively()

          promise.resolve(mapOf(
            "path" to outputFile.absolutePath,
            "size" to outputFile.length(),
            "fileCount" to files.size
          ))
        } catch (e: Exception) {
          promise.reject("ERR_ZIP_LOCK", "Failed to lock ZIP: ${e.message}", e)
        }
      }.start()
    }

    // isZipEncrypted(zipPath) -> { encrypted: Boolean }
    AsyncFunction("isZipEncrypted") { zipPath: String, promise: Promise ->
      Thread {
        try {
          val uri = Uri.parse(zipPath)
          val actualFile: File
          var tempFile: File? = null

          if (uri.scheme == "content") {
            val context = appContext.reactContext ?: throw Exception("No context")
            tempFile = File(context.cacheDir, "zip_check_${System.currentTimeMillis()}.zip")
            val inputStream = context.contentResolver.openInputStream(uri)
              ?: throw Exception("Could not open file")
            val outputStream = FileOutputStream(tempFile)
            inputStream.copyTo(outputStream)
            inputStream.close()
            outputStream.close()
            actualFile = tempFile
          } else {
            actualFile = File(zipPath.replace("file://", ""))
          }

          val zipFile = ZipFile(actualFile)
          val encrypted = zipFile.isEncrypted
          tempFile?.delete()

          promise.resolve(mapOf(
            "encrypted" to encrypted
          ))
        } catch (e: Exception) {
          promise.reject("ERR_ZIP_CHECK", "Failed to check ZIP: ${e.message}", e)
        }
      }.start()
    }
    // saveToDownloads(filePath, fileName) -> { success: Boolean }
    AsyncFunction("saveToDownloads") { filePath: String, fileName: String, mimeType: String, promise: Promise ->
      Thread {
        try {
          val context = appContext.reactContext ?: throw Exception("No context")
          val sourceFile = File(filePath.replace("file://", ""))
          if (!sourceFile.exists()) throw Exception("File not found")

          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val contentValues = ContentValues().apply {
              put(MediaStore.Downloads.DISPLAY_NAME, fileName)
              put(MediaStore.Downloads.MIME_TYPE, mimeType)
              put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
              ?: throw Exception("Failed to create file in Downloads")
            val outputStream = resolver.openOutputStream(uri)
              ?: throw Exception("Failed to open output stream")
            val inputStream = sourceFile.inputStream()
            inputStream.copyTo(outputStream)
            inputStream.close()
            outputStream.close()
          } else {
            // Pre-Q: need WRITE_EXTERNAL_STORAGE runtime permission
            val activity = appContext.currentActivity
              ?: throw Exception("No activity available")
            val hasPermission = ContextCompat.checkSelfPermission(
              context, Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasPermission) {
              throw Exception("PERMISSION_REQUIRED")
            }

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            downloadsDir.mkdirs()
            val destFile = File(downloadsDir, fileName)
            val outputStream = FileOutputStream(destFile)
            val inputStream = sourceFile.inputStream()
            inputStream.copyTo(outputStream)
            inputStream.close()
            outputStream.close()

            // Notify media scanner so it appears in Files app
            val values = ContentValues().apply {
              put(MediaStore.Files.FileColumns.DATA, destFile.absolutePath)
              put(MediaStore.Files.FileColumns.DISPLAY_NAME, fileName)
              put(MediaStore.Files.FileColumns.MIME_TYPE, mimeType)
            }
            context.contentResolver.insert(MediaStore.Files.getContentUri("external"), values)
          }

          promise.resolve(mapOf("success" to true))
        } catch (e: Exception) {
          promise.reject("ERR_SAVE", "Failed to save: ${e.message}", e)
        }
      }.start()
    }
  }
}
