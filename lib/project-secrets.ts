const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secretMaterial() {
  return process.env.KODO_SECRETS_ENCRYPTION_KEY || process.env.CLERK_SECRET_KEY || "";
}

export function projectSecretsConfigured() {
  return secretMaterial().length >= 24;
}

async function encryptionKey() {
  const material = secretMaterial();
  if (material.length < 24) throw new Error("Project secret encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`kodo-project-secrets:v1:${material}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export async function encryptProjectSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptProjectSecret(value: string) {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Unsupported encrypted secret format.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) }, await encryptionKey(), fromBase64Url(ciphertext));
  return decoder.decode(plaintext);
}

export function normalizeSecretKey(value: string) {
  const key = value.trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]{1,79}$/.test(key)) throw new Error("Use 2–80 uppercase letters, numbers, and underscores for the key.");
  if (key.startsWith("VERCEL_") || key.startsWith("KODO_")) throw new Error("Reserved VERCEL_ and KODO_ keys cannot be managed here.");
  return key;
}

export function normalizeTargets(value: unknown) {
  const allowed = new Set(["development", "preview", "production"]);
  const targets = Array.isArray(value) ? [...new Set(value.filter(item => typeof item === "string" && allowed.has(item)))] : [];
  if (!targets.length) throw new Error("Select at least one environment.");
  return targets as Array<"development" | "preview" | "production">;
}
