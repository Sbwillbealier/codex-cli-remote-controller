import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const dataRoot = process.env.CONTROLLER_DATA_DIR ?? join(process.cwd(), "data");
export const uploadRoot = process.env.CONTROLLER_UPLOAD_DIR ?? join(dataRoot, "uploads");
export const databasePath = process.env.CONTROLLER_DATABASE_PATH ?? join(dataRoot, "controller.sqlite");

mkdirSync(dataRoot, { recursive: true });
mkdirSync(uploadRoot, { recursive: true });

