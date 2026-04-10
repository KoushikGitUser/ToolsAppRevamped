import PdfToolsModule from './src/PdfToolsModule';

export type { PdfInfo, MergeResult, SplitResult, ExtractResult, LockResult, LockStatus, PdfToImagesResult, CreatePdfResult } from './src/PdfToolsModule';

export async function getPdfInfo(inputPath: string) {
  return await PdfToolsModule.getPdfInfo(inputPath);
}

export async function mergePdfs(inputPaths: string[], outputPath: string) {
  return await PdfToolsModule.mergePdfs(inputPaths, outputPath);
}

export async function splitPdf(inputPath: string, outputDir: string, baseName: string) {
  return await PdfToolsModule.splitPdf(inputPath, outputDir, baseName);
}

export async function extractPages(inputPath: string, pages: number[], outputPath: string) {
  return await PdfToolsModule.extractPages(inputPath, pages, outputPath);
}

export async function lockPdf(inputPath: string, password: string, outputPath: string) {
  return await PdfToolsModule.lockPdf(inputPath, password, outputPath);
}

export async function unlockPdf(inputPath: string, password: string, outputPath: string) {
  return await PdfToolsModule.unlockPdf(inputPath, password, outputPath);
}

export async function isPdfLocked(inputPath: string) {
  return await PdfToolsModule.isPdfLocked(inputPath);
}

export async function pdfToImages(inputPath: string, outputDir: string, quality: number) {
  return await PdfToolsModule.pdfToImages(inputPath, outputDir, quality);
}

export async function renderPage(inputPath: string, pageIndex: number, dpi: number = 150): Promise<string> {
  return await PdfToolsModule.renderPage(inputPath, pageIndex, dpi);
}

export async function createPdfFromImages(imagePaths: string[], outputPath: string) {
  return await PdfToolsModule.createPdfFromImages(imagePaths, outputPath);
}

export async function imagesToPdfNative(
  imagePaths: string[],
  pageWidth: number,
  pageHeight: number,
  marginPoints: number,
  outputPath: string
) {
  return await PdfToolsModule.imagesToPdfNative(
    imagePaths,
    pageWidth,
    pageHeight,
    marginPoints,
    outputPath
  );
}

export async function scanQRFromImage(imagePath: string) {
  return await PdfToolsModule.scanQRFromImage(imagePath);
}

export async function annotatePdf(
  inputPath: string,
  outputPath: string,
  annotationsJson: string,
  deletedPages: number[],
  rotationsJson: string
) {
  return await PdfToolsModule.annotatePdf(inputPath, outputPath, annotationsJson, deletedPages, rotationsJson);
}
