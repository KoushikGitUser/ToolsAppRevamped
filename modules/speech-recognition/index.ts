import SpeechRecognitionModule from './src/SpeechRecognitionModule';

export function isAvailable(): boolean {
  return SpeechRecognitionModule.isAvailable();
}

export function startListening(language: string = 'en-US'): void {
  SpeechRecognitionModule.startListening(language);
}

export function stopListening(): void {
  SpeechRecognitionModule.stopListening();
}

export function addResultListener(callback: (event: { text: string }) => void) {
  return SpeechRecognitionModule.addListener('onResult', callback);
}

export function addPartialResultListener(callback: (event: { text: string }) => void) {
  return SpeechRecognitionModule.addListener('onPartialResult', callback);
}

export function addErrorListener(callback: (event: { error: string; code: number }) => void) {
  return SpeechRecognitionModule.addListener('onError', callback);
}
