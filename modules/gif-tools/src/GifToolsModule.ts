import { NativeModule, requireNativeModule } from 'expo';

export interface GifCreateResult {
  path: string;
  size: number;
  frameCount: number;
}

export interface VideoToGifResult {
  path: string;
  size: number;
  frameCount: number;
  duration: number;
}

declare class GifToolsModule extends NativeModule {
  createGif(imagePaths: string[], outputPath: string, width: number, height: number, delayMs: number, quality: number): Promise<GifCreateResult>;
  videoToGif(videoPath: string, outputPath: string, width: number, fps: number, quality: number, maxDurationSec: number): Promise<VideoToGifResult>;
}

export default requireNativeModule<GifToolsModule>('GifTools');
