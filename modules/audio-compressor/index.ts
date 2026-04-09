import AudioCompressorModule from './src/AudioCompressorModule';

export interface CompressResult {
  path: string;
  size: number;
  bitrate: number;
  duration: number;
}

export async function compressAudio(
  inputPath: string,
  outputPath: string,
  targetBitrate: number
): Promise<CompressResult> {
  return await AudioCompressorModule.compressAudio(inputPath, outputPath, targetBitrate);
}
