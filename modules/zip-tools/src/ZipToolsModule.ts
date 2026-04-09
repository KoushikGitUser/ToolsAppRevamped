import { NativeModule, requireNativeModule } from 'expo';

export interface ZipCreateResult {
  path: string;
  size: number;
  fileCount: number;
}

export interface UnzipResult {
  paths: string[];
  names: string[];
  sizes: number[];
  fileCount: number;
}

export interface ZipEncryptedStatus {
  encrypted: boolean;
}

export interface SaveResult {
  success: boolean;
}

declare class ZipToolsModule extends NativeModule {
  createZipWithPassword(filePaths: string[], fileNames: string[], password: string, outputPath: string): Promise<ZipCreateResult>;
  unzipWithPassword(zipPath: string, password: string, outputDir: string): Promise<UnzipResult>;
  lockZip(zipPath: string, password: string, outputPath: string): Promise<ZipCreateResult>;
  isZipEncrypted(zipPath: string): Promise<ZipEncryptedStatus>;
  saveToDownloads(filePath: string, fileName: string, mimeType: string): Promise<SaveResult>;
}

export default requireNativeModule<ZipToolsModule>('ZipTools');
