// dist/server.mjs is produced by esbuild during the Vercel build (see
// vercel.json buildCommand). Importing the pre-bundled file with an explicit
// extension keeps Node's ESM resolver happy in the serverless runtime, where
// per-file transpiled TypeScript would otherwise leave extensionless imports.
// @ts-ignore -- the bundle only exists after a build
import { createApp } from "../dist/server.mjs";

export default createApp();
