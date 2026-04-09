import AudioExtractorModule from './src/AudioExtractorModule';

export interface ExtractResult {
  path: string;
  size: number;
}

export async function extractAudio(inputPath: string, outputPath: string): Promise<ExtractResult> {
  return await AudioExtractorModule.extractAudio(inputPath, outputPath);
}

export async function amplifyAudio(inputPath: string, outputPath: string, gain: number): Promise<ExtractResult> {
  return await AudioExtractorModule.amplifyAudio(inputPath, outputPath, gain);
}

export async function fadeAudio(inputPath: string, outputPath: string, gain: number, fadeInDuration: number, fadeOutDuration: number): Promise<ExtractResult> {
  return await AudioExtractorModule.fadeAudio(inputPath, outputPath, gain, fadeInDuration, fadeOutDuration);
}
