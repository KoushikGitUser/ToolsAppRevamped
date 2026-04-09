import { NativeModule, requireNativeModule } from 'expo';

export interface ConvertResult {
  path: string;
  size: number;
}

declare class VideoConverterModule extends NativeModule {
  convertToMp4(inputPath: string, outputPath: string): Promise<ConvertResult>;
}

export default requireNativeModule<VideoConverterModule>('VideoConverter');
