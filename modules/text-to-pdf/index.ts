import TextToPdfModule from './src/TextToPdfModule';

export interface PdfResult {
  path: string;
  pages: number;
  size: number;
}

export async function generatePdf(
  text: string,
  title: string,
  outputPath: string,
  pageWidth: number,
  pageHeight: number,
  fontSize: number
): Promise<PdfResult> {
  return await TextToPdfModule.generatePdf(text, title, outputPath, pageWidth, pageHeight, fontSize);
}

export async function generateRichPdf(
  html: string,
  title: string,
  outputPath: string,
  pageWidth: number,
  pageHeight: number,
  fontSize: number
): Promise<PdfResult> {
  return await TextToPdfModule.generateRichPdf(html, title, outputPath, pageWidth, pageHeight, fontSize);
}

export async function generateHtmlPdf(
  html: string,
  title: string,
  outputPath: string,
  pageWidth: number,
  pageHeight: number
): Promise<PdfResult> {
  return await TextToPdfModule.generateHtmlPdf(html, title, outputPath, pageWidth, pageHeight);
}
