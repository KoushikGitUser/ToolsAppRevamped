import { NativeModule, requireNativeModule } from 'expo';

declare class SpeechRecognitionModule extends NativeModule {
  isAvailable(): boolean;
  startListening(language: string): void;
  stopListening(): void;
}

export default requireNativeModule<SpeechRecognitionModule>('SpeechRecognition');
