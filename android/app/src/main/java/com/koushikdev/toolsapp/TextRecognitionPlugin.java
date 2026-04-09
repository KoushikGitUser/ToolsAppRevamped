package com.koushikdev.toolsapp;

import android.media.Image;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.mrousavy.camera.frameprocessors.Frame;
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin;
import com.mrousavy.camera.frameprocessors.VisionCameraProxy;

import java.util.Map;

/**
 * VisionCamera Frame Processor Plugin for live text recognition using ML Kit.
 * Called from JS via: plugin.call(frame) inside a useFrameProcessor worklet.
 * Returns detected text as a plain string, or empty string if none found.
 */
public class TextRecognitionPlugin extends FrameProcessorPlugin {
    private final TextRecognizer recognizer;
    private long lastProcessedTime = 0;
    private static final long THROTTLE_MS = 300; // Only run OCR once every 300ms

    TextRecognitionPlugin(@NonNull VisionCameraProxy proxy, @Nullable Map<String, Object> options) {
        super();
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    }

    @Override
    @SuppressWarnings("UnsafeOptInUsageError")
    public @Nullable Object callback(@NonNull Frame frame, @Nullable Map<String, Object> params) throws Throwable {
        // Throttle: skip frames to avoid overloading the CPU
        long now = System.currentTimeMillis();
        if (now - lastProcessedTime < THROTTLE_MS) {
            return null; // skip this frame
        }
        lastProcessedTime = now;

        try {
            Image image = frame.getImage();
            int rotation = frame.getImageProxy().getImageInfo().getRotationDegrees();
            InputImage inputImage = InputImage.fromMediaImage(image, rotation);

            // Synchronous ML Kit call — blocks the frame processor thread
            // (this is fine; VisionCamera runs frame processors on a separate thread)
            com.google.mlkit.vision.text.Text result = Tasks.await(recognizer.process(inputImage));
            String text = result.getText();

            if (text != null && !text.trim().isEmpty()) {
                return text.trim();
            }
            return "";
        } catch (Exception e) {
            return "";
        }
    }
}
