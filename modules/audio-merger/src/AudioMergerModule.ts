import { NativeModule, requireNativeModule } from 'expo';

export interface AudioInfo {
  uri: string;
  name: string;
  duration: number; // milliseconds
  sampleRate: number;
  channels: number;
  mimeType: string;
}

export interface MergeResult {
  uri: string;
  duration: number;
  size: number;
}

export interface MergeProgress {
  progress: number; // 0-100
}

declare class AudioMergerModule extends NativeModule<{ onProgress: (data: MergeProgress) => void }> {
  getAudioInfo(uri: string): Promise<AudioInfo>;
  mergeAudios(uris: string[], outputName: string): Promise<MergeResult>;
}

export default requireNativeModule<AudioMergerModule>('AudioMerger');
