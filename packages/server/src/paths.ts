import { fileURLToPath } from "node:url";
import path from "node:path";

/** Repo root (or /app in the container): src/ and dist/ both sit three levels below it. */
export const REPO_ROOT = process.env.INNERCOVE_ROOT ?? fileURLToPath(new URL("../../../", import.meta.url));

export const fromRoot = (p: string) => path.resolve(REPO_ROOT, p);
