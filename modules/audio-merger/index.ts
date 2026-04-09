import AudioMergerModule from './src/AudioMergerModule';

export type { AudioInfo, MergeResult, MergeProgress } from './src/AudioMergerModule';

export async function getAudioInfo(uri: string) {
  return await AudioMergerModule.getAudioInfo(uri);
}

export async function mergeAudios(uris: string[], outputName: string) {
  return await AudioMergerModule.mergeAudios(uris, outputName);
}

export function addProgressListener(listener: (data: { progress: number }) => void) {
  return AudioMergerModule.addListener('onProgress', listener);
}
