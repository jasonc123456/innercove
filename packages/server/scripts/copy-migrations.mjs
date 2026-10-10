import { cpSync } from "node:fs";
cpSync(new URL("../src/store/migrations", import.meta.url), new URL("../dist/store/migrations", import.meta.url), { recursive: true });
