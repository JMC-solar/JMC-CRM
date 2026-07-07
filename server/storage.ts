// Firebase Storage helpers for file uploads and downloads.
// Uploads go to this project's default Storage bucket (see server/firestore.ts `bucket()`).
// Uploaded files are served back via GET /storage/{key}, which the storage
// proxy (server/_core/storageProxy.ts) redirects to a short-lived signed URL.

import { bucket } from "./firestore";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/** Wraps a Firebase/GCS error with a clearer, non-crashing message. */
function wrapStorageError(action: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`Firebase Storage ${action} failed: ${message}`);
}

/**
 * Upload a file to Firebase Storage.
 * Returns the storage key and a local URL path for serving the file.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  try {
    await bucket().file(key).save(body, { contentType });
  } catch (err) {
    throw wrapStorageError("upload", err);
  }

  return { key, url: `/storage/${key}` };
}

/**
 * Download a file's contents from Firebase Storage.
 */
export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string; data: Buffer }> {
  const key = normalizeKey(relKey);

  let data: Buffer;
  try {
    [data] = await bucket().file(key).download();
  } catch (err) {
    throw wrapStorageError("download", err);
  }

  return { key, url: `/storage/${key}`, data };
}

/**
 * Get a presigned (signed) read URL directly from Firebase Storage.
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  try {
    const [url] = await bucket().file(key).getSignedUrl({
      action: "read",
      expires: Date.now() + 3600e3, // 1 hour
    });
    return url;
  } catch (err) {
    throw wrapStorageError("signed URL generation", err);
  }
}
