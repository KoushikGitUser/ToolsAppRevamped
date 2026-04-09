import { NativeModule, requireNativeModule } from 'expo';

export interface AppInfo {
  packageName: string;
  appName: string;
  cacheSize: number;
  dataSize: number;
  appSize: number;
  icon: string;
}

declare class AppCacheManagerModule extends NativeModule {
  hasUsagePermission(): boolean;
  openUsagePermissionSettings(): void;
  getInstalledApps(): Promise<AppInfo[]>;
  openAppSettings(packageName: string): void;
}

export default requireNativeModule<AppCacheManagerModule>('AppCacheManager');
