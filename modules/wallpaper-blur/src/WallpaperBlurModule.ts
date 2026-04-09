import { NativeModule, requireNativeModule } from 'expo';

export interface WallpaperInfo {
  uri: string;
  width: number;
  height: number;
}

export interface BlurResult {
  uri: string;
}

export interface SetResult {
  success: boolean;
}

declare class WallpaperBlurModule extends NativeModule {
  getWallpaper(): Promise<WallpaperInfo>;
  blurImage(uri: string, radius: number): Promise<BlurResult>;
  setWallpaper(uri: string, target: number): Promise<SetResult>;
}

export default requireNativeModule<WallpaperBlurModule>('WallpaperBlur');
