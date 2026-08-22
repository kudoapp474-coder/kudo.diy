"use client";

import { useEffect } from "react";
import { renderProjectDocument } from "../../lib/project-files";

type PreviewFile = { path: string; content: string; updated_at?: string };
type PreviewPayload = {
  project?: { name?: string };
  files?: PreviewFile[];
  generations?: Array<{ status?: string }>;
};

function previewSignature(files: PreviewFile[]) {
  return files.map(file => `${file.path}:${file.updated_at ?? ""}:${file.content.length}`).join("|");
}

export function LiveProjectPreviewSync({ projectId }: { projectId: string }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let appliedSignature = "";

    async function syncPreview() {
      let nextDelay = 2_500;
      try {
        if (document.visibilityState === "hidden") {
          nextDelay = 5_000;
          return;
        }
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as PreviewPayload;
        const files = Array.isArray(payload.files) ? payload.files : [];
        const agentRunning = payload.generations?.some(generation => generation.status === "running") ?? false;
        nextDelay = agentRunning ? 900 : 2_500;

        const signature = previewSignature(files);
        const iframe = document.querySelector<HTMLIFrameElement>(".live-preview iframe");
        if (!iframe || !signature || signature === appliedSignature) return;

        iframe.srcdoc = renderProjectDocument(files, payload.project?.name ?? "KODO project");
        iframe.dataset.kodoLivePreview = agentRunning ? "building" : "synced";
        appliedSignature = signature;
      } catch {
        nextDelay = 3_500;
      } finally {
        if (!cancelled) timer = setTimeout(() => void syncPreview(), nextDelay);
      }
    }

    void syncPreview();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);

  return null;
}
