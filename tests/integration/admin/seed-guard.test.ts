import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

/** Startet `scripts/seed.ts` wie `npm run db:seed`, aber mit eigener `DATABASE_URL` (dotenv überschreibt nichts). */
function runSeed(databaseUrl: string, args: string[] = []) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "development" };
  delete env.SEED_ALLOW_REMOTE;
  return spawnSync(TSX, ["--conditions=react-server", "scripts/seed.ts", ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("scripts/seed.ts – Schutz vor fremden Datenbanken", () => {
  it("verweigert eine nicht-lokale DATABASE_URL (auch mit --reset), bevor es sich verbindet", () => {
    const result = runSeed("postgres://postgres:secret@db.example.invalid:5432/prod", ["--reset"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SEED_ALLOW_REMOTE=1");
    expect(result.stderr).toContain("db.example.invalid");
    // keine Verbindung, kein Leeren
    expect(result.stdout).not.toContain("→ Datenbank");
    expect(result.stderr).not.toContain("secret");
  });

  it("lässt lokale Hosts durch (scheitert hier erst an der Verbindung)", () => {
    // Port 1: dort lauscht nichts – der Seed kommt am Schutz vorbei und scheitert beim Verbinden.
    const result = runSeed("postgres://postgres:postgres@127.0.0.1:1/happyfeet");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("→ Datenbank 127.0.0.1:1");
    expect(result.stderr).not.toContain("SEED_ALLOW_REMOTE");
  });
});
