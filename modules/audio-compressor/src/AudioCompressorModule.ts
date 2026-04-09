import { NativeModule, requireNativeModule } from 'expo';

export interface CompressResult {
  path: string;
  size: number;
  bitrate: number;
  duration: number;
}

declare class AudioCompressorModule extends NativeModule {
  compressAudio(inputPath: string, outputPath: string, targetBitrate: number): Promise<CompressResult>;
}

export default requireNativeModule<AudioCompressorModule>('AudioCompressor');
