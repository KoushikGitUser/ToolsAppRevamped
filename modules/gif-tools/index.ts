import GifToolsModule from './src/GifToolsModule';

export type { GifCreateResult, VideoToGifResult } from './src/GifToolsModule';

export async function createGif(imagePaths: string[], outputPath: string, width: number, height: number, delayMs: number, quality: number) {
  return await GifToolsModule.createGif(imagePaths, outputPath, width, height, delayMs, quality);
}

export async function videoToGif(videoPath: string, outputPath: string, width: number, fps: number, quality: number, maxDurationSec: number) {
  return await GifToolsModule.videoToGif(videoPath, outputPath, width, fps, quality, maxDurationSec);
}
