import multer from "multer";
import { NextFunction, Request, Response } from "express";
import { getDocumentHubMaxFileBytes } from "../utils/documentHubBlob";

export const documentHubUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getDocumentHubMaxFileBytes(), files: 1 },
}).single("file");

export function handleDocumentHubUpload(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  documentHubUpload(req, res, (error: unknown) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      const maxMb = Math.floor(getDocumentHubMaxFileBytes() / (1024 * 1024));
      return res.status(400).json({
        message: `File exceeds the maximum size of ${maxMb}MB.`,
      });
    }

    return res.status(400).json({
      message: "Unable to process the uploaded file.",
      error: error instanceof Error ? error.message : error,
    });
  });
}

export function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
