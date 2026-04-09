import { NativeModule, requireNativeModule } from 'expo';

export interface ExtractResult {
  path: string;
  size: number;
}

declare class AudioExtractorModule extends NativeModule {
  extractAudio(inputPath: string, outputPath: string): Promise<ExtractResult>;
  amplifyAudio(inputPath: string, outputPath: string, gain: number): Promise<ExtractResult>;
  fadeAudio(inputPath: string, outputPath: string, gain: number, fadeInDuration: number, fadeOutDuration: number): Promise<ExtractResult>;
}

export default requireNativeModule<AudioExtractorModule>('AudioExtractor');
