// backend/src/middlewares/upload.middleware.ts

import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

/* ======================================================
   DOCUMENT MIME TYPES
====================================================== */

const documentMimeTypes = new Set([
  "application/pdf",

  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "text/csv",
  "application/csv",

  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  "text/plain",
  "text/markdown",
  "text/x-markdown",

  "application/json",
  "application/xml",
  "text/xml",

  "text/html",
  "text/css",

  "application/javascript",
  "text/javascript",
  "application/typescript",
  "text/typescript",

  "text/x-python",
  "application/x-python-code",

  "application/x-httpd-php",

  "application/x-sh",

  "application/rtf",
  "text/rtf",

  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",

  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
  "application/x-tar",
]);

/* ======================================================
   DOCUMENT EXTENSIONS
====================================================== */

const documentExtensions = new Set([
  ".pdf",

  ".doc",
  ".docx",

  ".xls",
  ".xlsx",
  ".csv",

  ".ppt",
  ".pptx",

  ".txt",
  ".md",

  ".json",
  ".xml",

  ".html",
  ".css",

  ".js",
  ".ts",

  ".py",
  ".php",
  ".sh",

  ".rtf",

  ".odt",
  ".ods",
  ".odp",

  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
]);

/* ======================================================
   IMAGE MIME TYPES
====================================================== */

const imageMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

/* ======================================================
   IMAGE EXTENSIONS
====================================================== */

const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
]);

/* ======================================================
   DOCUMENT FILTER
====================================================== */

const documentFileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  cb
) => {

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  const mimeAllowed =
    documentMimeTypes.has(file.mimetype);

  const extensionAllowed =
    documentExtensions.has(extension);

  if (
    mimeAllowed ||
    extensionAllowed
  ) {
    return cb(null, true);
  }

  return cb(
    new Error(
      `Unsupported document type (${extension || file.mimetype}).`
    )
  );
};

/* ======================================================
   IMAGE FILTER
====================================================== */

const imageFileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  cb
) => {

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  const mimeAllowed =
    imageMimeTypes.has(file.mimetype);

  const extensionAllowed =
    imageExtensions.has(extension);

  if (
    mimeAllowed ||
    extensionAllowed
  ) {
    return cb(null, true);
  }

  return cb(
    new Error(
      `Unsupported image type (${extension || file.mimetype}).`
    )
  );
};

/* ======================================================
   GENERIC UPLOADER
====================================================== */

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

/* ======================================================
   CHAT DOCUMENT UPLOADER
====================================================== */

export const chatDocumentUpload = multer({
  storage,

  fileFilter: documentFileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

/* ======================================================
   CHAT IMAGE UPLOADER
====================================================== */

export const chatImageUpload = multer({
  storage,

  fileFilter: imageFileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});