import VideoConverterModule from './src/VideoConverterModule';

export interface ConvertResult {
  path: string;
  size: number;
}

export async function convertToMp4(
  inputPath: string,
  outputPath: string
): Promise<ConvertResult> {
  return await VideoConverterModule.convertToMp4(inputPath, outputPath);
}
