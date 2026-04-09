import WallpaperBlurModule from './src/WallpaperBlurModule';

export type { WallpaperInfo, BlurResult, SetResult } from './src/WallpaperBlurModule';

// target: 0 = Both, 1 = Home Screen, 2 = Lock Screen
export async function getWallpaper() {
  return await WallpaperBlurModule.getWallpaper();
}

export async function blurImage(uri: string, radius: number) {
  return await WallpaperBlurModule.blurImage(uri, radius);
}

export async function setWallpaper(uri: string, target: number = 0) {
  return await WallpaperBlurModule.setWallpaper(uri, target);
}
