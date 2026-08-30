/**
 * Generate or import the apt archive signing key (ADR 0019).
 *
 * The public keyring is what Signed-By points at. The secret stays in
 * `RCLWEB_APT_GPG_PRIVATE_KEY` — do not commit it.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireCommand, requireTool } from "./apt-run.ts";

export const KEYRING_BASENAME = "rclweb-archive-keyring.gpg";

export type AptKeyPair = {
  gnupgHome: string;
  publicKeyring: string;
  secretArmor: string;
  fingerprint: string;
};

function gpgEnv(gnupgHome: string): NodeJS.ProcessEnv {
  return {
    GNUPGHOME: gnupgHome,
    GNUPGHOME_IGNORE_LOCK: "1",
  };
}

export function createGnupgHome(parent?: string): string {
  const home = mkdtempSync(path.join(parent ?? tmpdir(), "rclweb-apt-gnupg-"));
  writeFileSync(
    path.join(home, "gpg.conf"),
    "personal-digest-preferences SHA256\ncert-digest-algo SHA256\n",
  );
  return home;
}

export function generateAptArchiveKey(outDir: string): AptKeyPair {
  requireTool("gpg");
  mkdirSync(outDir, { recursive: true });
  const gnupgHome = createGnupgHome(outDir);
  const batch = path.join(gnupgHome, "batch");
  writeFileSync(
    batch,
    [
      "%no-protection",
      "Key-Type: RSA",
      "Key-Length: 4096",
      "Key-Usage: sign",
      "Name-Real: rclweb apt",
      "Name-Email: maintainers@localhost",
      "Expire-Date: 0",
      "%commit",
      "",
    ].join("\n"),
  );
  requireCommand("gpg", ["--batch", "--generate-key", batch], {
    env: gpgEnv(gnupgHome),
    label: "gpg --generate-key",
  });
  const fingerprint = readPrimaryFingerprint(gnupgHome);
  const publicKeyring = path.join(outDir, KEYRING_BASENAME);
  exportPublicKeyring(gnupgHome, publicKeyring);
  const secret = requireCommand(
    "gpg",
    ["--batch", "--armor", "--export-secret-keys", fingerprint],
    { env: gpgEnv(gnupgHome), label: "gpg --export-secret-keys" },
  );
  return {
    gnupgHome,
    publicKeyring,
    secretArmor: secret.stdout,
    fingerprint,
  };
}

export function importSecretKey(
  gnupgHome: string,
  secretArmor: string,
  passphrase = "",
): string {
  requireTool("gpg");
  mkdirSync(gnupgHome, { recursive: true });
  const secretFile = path.join(gnupgHome, "secret.asc");
  writeFileSync(secretFile, secretArmor);
  const args = ["--batch", "--import", secretFile];
  if (passphrase) {
    args.splice(1, 0, "--pinentry-mode", "loopback", "--passphrase", passphrase);
  }
  requireCommand("gpg", args, {
    env: gpgEnv(gnupgHome),
    label: "gpg --import",
  });
  return readPrimaryFingerprint(gnupgHome);
}

export function exportPublicKeyring(gnupgHome: string, dest: string): void {
  requireCommand("gpg", ["--batch", "--output", dest, "--export"], {
    env: gpgEnv(gnupgHome),
    label: "gpg --export --output",
  });
}

function readPrimaryFingerprint(gnupgHome: string): string {
  const listed = requireCommand(
    "gpg",
    ["--batch", "--with-colons", "--list-secret-keys"],
    { env: gpgEnv(gnupgHome), label: "gpg --list-secret-keys" },
  );
  for (const line of listed.stdout.split("\n")) {
    if (line.startsWith("fpr:")) {
      const fingerprint = line.split(":")[9];
      if (fingerprint) return fingerprint;
    }
  }
  throw new Error("gpg produced no secret-key fingerprint");
}

function parseGenerateArgs(argv: string[]): { outDir: string; writeSecret: boolean } {
  let outDir = "";
  let writeSecret = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--generate") continue;
    if (arg === "--write-secret") {
      writeSecret = true;
      continue;
    }
    if (arg === "--out-dir") {
      outDir = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!outDir) {
    throw new Error("usage: bun run scripts/apt-archive-key.ts --generate --out-dir DIR [--write-secret]");
  }
  return { outDir, writeSecret };
}

function main(argv: string[]): void {
  if (argv[0] !== "--generate") {
    throw new Error("usage: bun run scripts/apt-archive-key.ts --generate --out-dir DIR [--write-secret]");
  }
  const { outDir, writeSecret } = parseGenerateArgs(argv);
  const pair = generateAptArchiveKey(outDir);
  console.log(`keyring ${pair.publicKeyring}`);
  console.log(`fingerprint ${pair.fingerprint}`);
  if (writeSecret) {
    const secretPath = path.join(outDir, "rclweb-archive-key.secret.asc");
    writeFileSync(secretPath, pair.secretArmor);
    console.log(`secret ${secretPath}`);
    console.log("do not commit the secret; add it as RCLWEB_APT_GPG_PRIVATE_KEY");
  }
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
