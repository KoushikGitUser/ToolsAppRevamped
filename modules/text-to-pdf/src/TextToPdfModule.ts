import { NativeModule, requireNativeModule } from 'expo';

export interface PdfResult {
  path: string;
  pages: number;
  size: number;
}

declare class TextToPdfModule extends NativeModule {
  generatePdf(
    text: string,
    title: string,
    outputPath: string,
    pageWidth: number,
    pageHeight: number,
    fontSize: number
  ): Promise<PdfResult>;
  generateRichPdf(
    html: string,
    title: string,
    outputPath: string,
    pageWidth: number,
    pageHeight: number,
    fontSize: number
  ): Promise<PdfResult>;
  generateHtmlPdf(
    html: string,
    title: string,
    outputPath: string,
    pageWidth: number,
    pageHeight: number
  ): Promise<PdfResult>;
}

export default requireNativeModule<TextToPdfModule>('TextToPdf');
