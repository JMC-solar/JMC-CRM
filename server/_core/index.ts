import "./loadEnv";
import { createServer } from "http";
import { createApp } from "./app";
import { setupVite } from "./vite";

async function startServer() {
  const app = createApp();
  const server = createServer(app);

  await setupVite(app, server);

  const port = 3000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
