import { Sandbox } from "@vercel/sandbox";

type ProjectFile = { path: string; content: string };

const MAX_FILES = 80;
const MAX_TOTAL_BYTES = 2_000_000;
const OUTPUT_LIMIT = 24_000;
const ALLOWED_COMMANDS = new Map<string, { cmd: string; args: string[] }>([
  ["npm run build", { cmd: "npm", args: ["run", "build"] }],
  ["npm test", { cmd: "npm", args: ["test"] }],
  ["npm run test", { cmd: "npm", args: ["run", "test"] }],
  ["npm run lint", { cmd: "npm", args: ["run", "lint"] }],
  ["npm run typecheck", { cmd: "npm", args: ["run", "typecheck"] }],
]);

function safePath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  if (normalized.split("/").some(part => part === ".." || part === "")) return null;
  return normalized;
}

function tail(value: string) {
  return value.length <= OUTPUT_LIMIT ? value : value.slice(-OUTPUT_LIMIT);
}

export function nativeSandboxConfigured() {
  return Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_OIDC_TOKEN ||
    (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID),
  );
}

export async function runProjectChecks(files: ProjectFile[], requestedCommand: string) {
  const command = ALLOWED_COMMANDS.get(requestedCommand.trim());
  if (!command) {
    return { status: "failed" as const, error: "Command is not allowed in the secure sandbox." };
  }

  if (files.length === 0 || files.length > MAX_FILES) {
    return { status: "failed" as const, error: `Sandbox accepts 1-${MAX_FILES} project files.` };
  }

  let totalBytes = 0;
  const uploads: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    const path = safePath(file.path);
    if (!path) return { status: "failed" as const, error: `Unsafe project path: ${file.path}` };
    totalBytes += Buffer.byteLength(file.content, "utf8");
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { status: "failed" as const, error: "Project is too large for a single sandbox check." };
    }
    uploads.push({ path: `workspace/${path}`, content: file.content });
  }

  const sandbox = await Sandbox.create({
    timeout: 300_000,
    resources: { vcpus: 2 },
    persistent: false,
    tags: { service: "kodo", purpose: "project-check" },
  });

  try {
    await sandbox.mkDir("workspace");
    await sandbox.writeFiles(uploads);

    const hasLockfile = uploads.some(file => file.path === "workspace/package-lock.json");
    const hasPackage = uploads.some(file => file.path === "workspace/package.json");
    if (!hasPackage) return { status: "failed" as const, error: "package.json is required for checks." };

    const install = await sandbox.runCommand({
      cmd: "npm",
      args: hasLockfile ? ["ci"] : ["install"],
      cwd: "workspace",
      timeoutMs: 150_000,
    });
    const [installStdout, installStderr] = await Promise.all([install.stdout(), install.stderr()]);
    if (install.exitCode !== 0) {
      return {
        status: "failed" as const,
        phase: "install",
        exitCode: install.exitCode,
        stdout: tail(installStdout),
        stderr: tail(installStderr),
      };
    }

    const check = await sandbox.runCommand({ ...command, cwd: "workspace", timeoutMs: 120_000 });
    const [stdout, stderr] = await Promise.all([check.stdout(), check.stderr()]);
    return {
      status: check.exitCode === 0 ? "passed" as const : "failed" as const,
      phase: "check",
      command: requestedCommand.trim(),
      exitCode: check.exitCode,
      stdout: tail(stdout),
      stderr: tail(stderr),
    };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
