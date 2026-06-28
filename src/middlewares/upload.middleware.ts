// backend/src/middlewares/upload.middleware.ts

import multer from "multer";

const storage = multer.memoryStorage();

const documentMimeTypes = new Set([
  "application/pdf",

  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // ZIP
  "application/zip",
  "application/x-zip-compressed",

  // Text
  "text/plain",
]);

const documentFileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  cb
) => {
  if (documentMimeTypes.has(file.mimetype)) {
    return cb(null, true);
  }

  return cb(
    new Error(
      "Unsupported document type. Allowed: PDF, Word, Excel, ZIP and TXT."
    )
  );
};

/**
 * Existing generic uploader.
 * Keep unchanged so current features continue working.
 */
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

/**
 * Chat document uploader.
 * Used only by chat document endpoints.
 */
export const chatDocumentUpload = multer({
  storage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});