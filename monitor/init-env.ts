import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const templateFile = fileURLToPath(new URL("../.env.example", import.meta.url));
const localFile = fileURLToPath(new URL("../web/.env.local", import.meta.url));

try {
  const template = await readFile(templateFile, "utf8");
  const contents = template.replace(/^DEMO_API_TOKEN=$/m, `DEMO_API_TOKEN=${randomBytes(32).toString("hex")}`);
  await writeFile(localFile, contents, { flag: "wx", mode: 0o600 });
  console.log("Creado web/.env.local en modo simulado. Token local generado; no se muestra en consola.");
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    console.log("web/.env.local ya existe. Se conserva sin cambios.");
  } else {
    console.error("No se pudo crear web/.env.local. Revisa el archivo de ejemplo y los permisos.");
    process.exitCode = 1;
  }
}
