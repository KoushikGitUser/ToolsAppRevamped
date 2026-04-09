import BgRemoverModule from './src/BgRemoverModule';

export type { RemoveResult } from './src/BgRemoverModule';

export async function removeBackground(inputPath: string, outputPath: string) {
  return await BgRemoverModule.removeBackground(inputPath, outputPath);
}
