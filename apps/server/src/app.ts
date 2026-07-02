import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { registerAdminRoutes } from "./modules/admin/admin-routes.js";
import { registerAuthRoutes } from "./modules/auth/auth-routes.js";
import { registerCommandRoutes } from "./modules/command/command-routes.js";
import { registerControllerSocket } from "./modules/websocket/controller-socket.js";
import { registerUploadRoutes } from "./modules/upload/upload-routes.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(serverRoot, "../..");

function webDistDir() {
  if (process.env.WEB_DIST_DIR) {
    return isAbsolute(process.env.WEB_DIST_DIR)
      ? process.env.WEB_DIST_DIR
      : resolve(projectRoot, process.env.WEB_DIST_DIR);
  }

  return join(projectRoot, "apps/web/dist");
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  await app.register(websocket);
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 4,
    },
  });

  app.get("/health", async () => {
    return {
      ok: true,
      service: "codex-remote-controller",
    };
  });

  await registerAdminRoutes(app);
  await registerAuthRoutes(app);
  await registerCommandRoutes(app);
  await registerUploadRoutes(app);
  await registerControllerSocket(app);

  const staticRoot = webDistDir();

  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/ws")) {
        return reply.code(404).send({
          code: "NOT_FOUND",
          message: "Route not found.",
        });
      }

      return reply.sendFile("index.html");
    });
  }

  return app;
}
