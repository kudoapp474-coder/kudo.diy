import { redirect } from "next/navigation";
import { LiveProjectPreviewSync } from "../../components/live-project-preview-sync";
import { ProjectWorkspace } from "../../components/project-workspace";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ task?: string; autorun?: string; notice?: string; model?: string }> }) {
  const { projectId } = await params;
  if (projectId === "new") redirect("/workspace#build");
  const query = await searchParams;
  return <>
    <ProjectWorkspace projectId={projectId} initialTask={query.task?.slice(0, 12000) ?? ""} autoRun={query.autorun === "1"} initialNotice={query.notice?.slice(0, 500) ?? ""} initialModel={query.model?.slice(0, 80) ?? ""} />
    <LiveProjectPreviewSync projectId={projectId} />
  </>;
}
