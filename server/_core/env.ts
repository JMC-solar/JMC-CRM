export const ENV = {
  appId: process.env.APP_ID ?? "jmc-solar-crm",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Optional: openId auto-granted the admin role on upsert (see server/db.ts)
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // AWS S3 Configuration
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "", // Optional: for S3-compatible services like DigitalOcean Spaces
  // Google Maps (optional)
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  // Fixed origin for this deployment — needed at app-boot time for the OAuth
  // issuer/resource URLs (mcpAuthRouter mounts once per cold start, so this
  // can't be derived per-request the way export/document links are).
  // MUST be set to the real https origin in Vercel prod env vars.
  appPublicUrl: process.env.APP_PUBLIC_URL ?? "http://localhost:3000",
};
