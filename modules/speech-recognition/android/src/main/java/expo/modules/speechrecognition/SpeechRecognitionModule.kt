package expo.modules.speechrecognition

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpeechRecognitionModule : Module() {
  private var speechRecognizer: SpeechRecognizer? = null
  private var isListening = false
  private var shouldKeepListening = false // true = continuous mode (don't stop on silence)
  private var currentLanguage = "en-US"
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("SpeechRecognition")

    Events("onResult", "onPartialResult", "onError", "onEnd")

    Function("isAvailable") {
      val context = appContext.reactContext ?: return@Function false
      SpeechRecognizer.isRecognitionAvailable(context)
    }

    Function("startListening") { language: String ->
      val context = appContext.reactContext ?: throw Exception("Context not available")
      currentLanguage = language
      shouldKeepListening = true

      mainHandler.post {
        if (isListening) {
          stopRecognizerInternal()
        }
        startRecognizerInternal()
      }
    }

    Function("stopListening") {
      shouldKeepListening = false
      mainHandler.post { stopRecognizerInternal() }
    }

    OnDestroy {
      shouldKeepListening = false
      mainHandler.post { stopRecognizerInternal() }
    }
  }

  private fun startRecognizerInternal() {
    val context = appContext.reactContext ?: return

    val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
    speechRecognizer = recognizer

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLanguage)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }

    recognizer.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}

      override fun onResults(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = matches?.firstOrNull() ?: ""
        sendEvent("onResult", mapOf("text" to text))
        isListening = false

        // Auto-restart if user hasn't manually stopped
        if (shouldKeepListening) {
          mainHandler.postDelayed({
            if (shouldKeepListening) {
              startRecognizerInternal()
            }
          }, 300) // Small delay before restarting
        }
      }

      override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        val text = matches?.firstOrNull() ?: ""
        if (text.isNotEmpty()) {
          sendEvent("onPartialResult", mapOf("text" to text))
        }
      }

      override fun onError(error: Int) {
        isListening = false

        // These errors mean "silence detected" or "no speech heard" — restart silently
        val isSilenceError = error == SpeechRecognizer.ERROR_NO_MATCH
            || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT

        if (isSilenceError && shouldKeepListening) {
          // Restart listening silently — user just paused speaking
          mainHandler.postDelayed({
            if (shouldKeepListening) {
              startRecognizerInternal()
            }
          }, 300)
          return
        }

        // Real errors — report to JS
        val message = when (error) {
          SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
          SpeechRecognizer.ERROR_CLIENT -> "Client error"
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
          SpeechRecognizer.ERROR_NETWORK -> "Network error"
          SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
          SpeechRecognizer.ERROR_NO_MATCH -> "No match found"
          SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
          SpeechRecognizer.ERROR_SERVER -> "Server error"
          SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
          else -> "Unknown error ($error)"
        }
        shouldKeepListening = false
        sendEvent("onError", mapOf("error" to message, "code" to error))
      }

      override fun onEvent(eventType: Int, params: Bundle?) {}
    })

    recognizer.startListening(intent)
    isListening = true
  }

  private fun stopRecognizerInternal() {
    try {
      speechRecognizer?.stopListening()
      speechRecognizer?.cancel()
      speechRecognizer?.destroy()
    } catch (_: Exception) {}
    speechRecognizer = null
    isListening = false
  }
}
