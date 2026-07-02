import type { FastifyInstance } from "fastify";
import { requireRequestSession } from "../auth/auth-routes.js";
import { slashCommands } from "./command-catalog.js";

export async function registerCommandRoutes(app: FastifyInstance) {
  app.get("/api/commands", async (request, reply) => {
    const session = requireRequestSession(request, reply);

    if (!session) {
      return;
    }

    return {
      commands: slashCommands,
    };
  });
}
