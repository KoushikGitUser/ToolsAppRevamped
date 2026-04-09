import { NativeModule, requireNativeModule } from 'expo';

export interface PdfInfo {
  pageCount: number;
  size: number;
}

export interface MergeResult {
  path: string;
  size: number;
  pageCount: number;
}

export interface SplitResult {
  paths: string[];
  sizes: number[];
  pageCount: number;
}

export interface ExtractResult {
  path: string;
  size: number;
  pageCount: number;
}

export interface LockResult {
  path: string;
  size: number;
  pageCount: number;
}

export interface LockStatus {
  locked: boolean;
  pageCount: number;
}

export interface PdfToImagesResult {
  paths: string[];
  sizes: number[];
  pageCount: number;
}

export interface CreatePdfResult {
  path: string;
  size: number;
  pageCount: number;
}

declare class PdfToolsModule extends NativeModule {
  getPdfInfo(inputPath: string): Promise<PdfInfo>;
  mergePdfs(inputPaths: string[], outputPath: string): Promise<MergeResult>;
  splitPdf(inputPath: string, outputDir: string, baseName: string): Promise<SplitResult>;
  extractPages(inputPath: string, pages: number[], outputPath: string): Promise<ExtractResult>;
  lockPdf(inputPath: string, password: string, outputPath: string): Promise<LockResult>;
  unlockPdf(inputPath: string, password: string, outputPath: string): Promise<LockResult>;
  isPdfLocked(inputPath: string): Promise<LockStatus>;
  pdfToImages(inputPath: string, outputDir: string, quality: number): Promise<PdfToImagesResult>;
  renderPage(inputPath: string, pageIndex: number, dpi: number): Promise<string>;
  createPdfFromImages(imagePaths: string[], outputPath: string): Promise<CreatePdfResult>;
  imagesToPdfNative(
    imagePaths: string[],
    pageWidth: number,
    pageHeight: number,
    marginPoints: number,
    outputPath: string
  ): Promise<CreatePdfResult>;
  annotatePdf(inputPath: string, outputPath: string, annotationsJson: string, deletedPages: number[], rotationsJson: string): Promise<CreatePdfResult>;
}

export default requireNativeModule<PdfToolsModule>('PdfTools');
