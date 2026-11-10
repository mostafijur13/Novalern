// Reads uploaded PNG / JPG / WEBP / PDF files for the AI.
//
// Images  -> { kind: "image", dataUrl }
// PDFs    -> { kind: "pdf-text", text }        when the PDF has selectable text
//         -> { kind: "pdf-images", pages[] }   when it is scanned (pages rendered to images)

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.pdf";
export const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_PDF_TEXT_PAGES = 30;
const MAX_PDF_IMAGE_PAGES = 3; // vision model limit per request
const MAX_PDF_TEXT_CHARS = 60000;
const MAX_IMAGE_SIDE = 1600; // downscale large photos to keep requests small

export async function readUpload(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`${file.name}: only PNG, JPG, WEBP or PDF files are supported.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name}: file is larger than 6 MB.`);
  }
  const base = { name: file.name, mediaType: file.type, size: file.size };
  if (file.type === "application/pdf") {
    return { ...base, ...(await readPdf(file)) };
  }
  const dataUrl = await downscaleImage(await readAsDataUrl(file));
  return { ...base, kind: "image", dataUrl, previewUrl: dataUrl };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function downscaleImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      if (scale === 1) return resolve(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function readPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // 1. Try selectable text.
  const textPages = Math.min(pdf.numPages, MAX_PDF_TEXT_PAGES);
  let text = "";
  for (let i = 1; i <= textPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    if (pageText) text += `\n\n[Page ${i}]\n${pageText}`;
  }
  text = text.trim();
  if (text.length > 80 * textPages) {
    const note = pdf.numPages > MAX_PDF_TEXT_PAGES ? `\n\n[Only the first ${MAX_PDF_TEXT_PAGES} of ${pdf.numPages} pages were read]` : "";
    return { kind: "pdf-text", text: text.slice(0, MAX_PDF_TEXT_CHARS) + note, pageCount: pdf.numPages, previewUrl: null };
  }

  // 2. Scanned PDF: render the first pages to images so the vision model can read them.
  const pages = [];
  const imagePages = Math.min(pdf.numPages, MAX_PDF_IMAGE_PAGES);
  for (let i = 1; i <= imagePages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return { kind: "pdf-images", pages, pageCount: pdf.numPages, previewUrl: pages[0] || null };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
