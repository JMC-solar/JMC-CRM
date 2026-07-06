import type { Express } from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./env";

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
    if (ENV.s3Endpoint) {
      config.endpoint = ENV.s3Endpoint;
      config.forcePathStyle = true;
    }
    _s3Client = new S3Client(config);
  }
  return _s3Client;
}

export function registerStorageProxy(app: Express) {
  // Serve files from /storage/* path (new path for self-hosted)
  app.get("/storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
      res.status(500).send("Storage not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in .env");
      return;
    }

    try {
      const s3 = getS3Client();
      const command = new GetObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: key,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

      res.set("Cache-Control", "public, max-age=3600");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });

  // Also handle legacy /manus-storage/* paths for backward compatibility during migration
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
      // If S3 is not configured, try to serve from local public folder
      res.redirect(307, `/images/${key}`);
      return;
    }

    try {
      const s3 = getS3Client();
      const command = new GetObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: key,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

      res.set("Cache-Control", "public, max-age=3600");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      // Fallback to local images folder
      res.redirect(307, `/images/${key}`);
    }
  });
}
