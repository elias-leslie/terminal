"use client";

import { useState, useCallback } from "react";

interface UploadResult {
  path: string;
  filename: string;
  size: number;
  mime_type: string;
}

interface UploadError {
  message: string;
  status?: number;
}

interface UseFileUploadReturn {
  /** Upload a file to the server */
  uploadFile: (file: File) => Promise<UploadResult | null>;
  /** Upload progress (0-100) */
  progress: number;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Last upload error */
  error: UploadError | null;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for uploading files to the terminal server.
 * Uses XMLHttpRequest for progress tracking.
 */
export function useFileUpload(): UseFileUploadReturn {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult | null> => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("file", file);

      // Track upload progress
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
        }
      });

      xhr.addEventListener("load", () => {
        setIsUploading(false);

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText) as UploadResult;
            setProgress(100);
            resolve(result);
          } catch {
            setError({ message: "Invalid server response" });
            resolve(null);
          }
        } else {
          // Handle error responses
          let message = "Upload failed";
          try {
            const errorData = JSON.parse(xhr.responseText);
            message = errorData.detail || message;
          } catch {
            // Use default message
          }

          setError({ message, status: xhr.status });
          resolve(null);
        }
      });

      xhr.addEventListener("error", () => {
        setIsUploading(false);
        setError({ message: "Network error during upload" });
        resolve(null);
      });

      xhr.addEventListener("abort", () => {
        setIsUploading(false);
        setError({ message: "Upload cancelled" });
        resolve(null);
      });

      xhr.open("POST", "/api/terminal/files");
      xhr.send(formData);
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    uploadFile,
    progress,
    isUploading,
    error,
    clearError,
  };
}
