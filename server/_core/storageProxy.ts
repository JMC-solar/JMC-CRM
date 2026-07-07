import type { Express } from "express";
import { bucket } from "../firestore";

export function registerStorageProxy(app: Express) {
  // Serve files from /storage/* by redirecting to a short-lived Firebase
  // Storage signed URL. No legacy data predates this app's Firebase Storage
  // adoption, so there is no /manus-storage or local /images fallback.
  app.get("/storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const [url] = await bucket().file(key).getSignedUrl({
        action: "read",
        expires: Date.now() + 3600e3, // 1 hour
      });

      res.set("Cache-Control", "public, max-age=3600");
      res.redirect(307, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("FIREBASE_STORAGE_BUCKET")) {
        console.error("[StorageProxy] not configured:", message);
        res.status(500).send("Storage not configured. Set FIREBASE_STORAGE_BUCKET in .env");
        return;
      }
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
