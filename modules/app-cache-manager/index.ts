import AppCacheManagerModule from './src/AppCacheManagerModule';

export type { AppInfo } from './src/AppCacheManagerModule';

export function hasUsagePermission(): boolean {
  return AppCacheManagerModule.hasUsagePermission();
}

export function openUsagePermissionSettings(): void {
  AppCacheManagerModule.openUsagePermissionSettings();
}

export async function getInstalledApps() {
  return await AppCacheManagerModule.getInstalledApps();
}

export function openAppSettings(packageName: string): void {
  AppCacheManagerModule.openAppSettings(packageName);
}
