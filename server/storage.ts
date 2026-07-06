// Direct AWS S3 storage helpers for file uploads and downloads.
// Uploads directly to your own S3 bucket using presigned URLs.
// Downloads return /storage/{key} paths served via the storage proxy.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const config: any = {
      region: ENV.s3Region,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
    };
    // Support S3-compatible services (DigitalOcean Spaces, MinIO, etc.)
    if (ENV.s3Endpoint) {
      config.endpoint = ENV.s3Endpoint;
      config.forcePathStyle = true;
    }
    _s3Client = new S3Client(config);
  }
  return _s3Client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

/**
 * Upload a file to S3
 * Returns the storage key and a local URL path for serving the file
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
    throw new Error(
      "S3 config missing: set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY"
    );
  }

  const key = appendHashSuffix(normalizeKey(relKey));
  const s3 = getS3Client();

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await s3.send(new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return { key, url: `/storage/${key}` };
}

/**
 * Get a local URL path for a stored file
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${key}` };
}

/**
 * Get a presigned download URL directly from S3
 */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
    throw new Error(
      "S3 config missing: set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY"
    );
  }

  const key = normalizeKey(relKey);
  const s3 = getS3Client();

  const command = new GetObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
  return url;
}
