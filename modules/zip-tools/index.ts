import ZipToolsModule from './src/ZipToolsModule';

export type { ZipCreateResult, UnzipResult, ZipEncryptedStatus, SaveResult } from './src/ZipToolsModule';

export async function createZipWithPassword(filePaths: string[], fileNames: string[], password: string, outputPath: string) {
  return await ZipToolsModule.createZipWithPassword(filePaths, fileNames, password, outputPath);
}

export async function unzipWithPassword(zipPath: string, password: string, outputDir: string) {
  return await ZipToolsModule.unzipWithPassword(zipPath, password, outputDir);
}

export async function lockZip(zipPath: string, password: string, outputPath: string) {
  return await ZipToolsModule.lockZip(zipPath, password, outputPath);
}

export async function isZipEncrypted(zipPath: string) {
  return await ZipToolsModule.isZipEncrypted(zipPath);
}

export async function saveToDownloads(filePath: string, fileName: string, mimeType: string = 'application/octet-stream') {
  return await ZipToolsModule.saveToDownloads(filePath, fileName, mimeType);
}
