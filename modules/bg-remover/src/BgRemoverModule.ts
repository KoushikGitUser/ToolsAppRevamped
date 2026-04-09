import { NativeModule, requireNativeModule } from 'expo';

export interface RemoveResult {
  path: string;
  size: number;
  width: number;
  height: number;
}

declare class BgRemoverModule extends NativeModule {
  removeBackground(inputPath: string, outputPath: string): Promise<RemoveResult>;
}

export default requireNativeModule<BgRemoverModule>('BgRemover');
