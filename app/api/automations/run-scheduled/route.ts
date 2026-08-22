import { all, ensureDatabase, now } from "../../../../lib/db";
import { runKodoAgent } from "../../../../lib/agent-runner";

type ScheduledAutomation = { id: string; workspace_id: string; project_id: string | null; prompt: string; owner_email: string };

export const maxDuration = 300;

// Runs once per invocation of the Vercel Cron job configured in vercel.json.
// On the Hobby plan Vercel limits a cron schedule to once per day, so a
// "schedule" automation cannot honor an exact time-of-day or day-of-week —
// it runs at most once per day, whenever this cron fires.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Scheduled automations are not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const db = await ensureDatabase();
  const due = await all<ScheduledAutomation>(db.prepare(`
    SELECT a.id, a.workspace_id, a.project_id, a.prompt, w.owner_email
    FROM automations a
    JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.trigger_type = 'schedule' AND a.active = 1 AND a.project_id IS NOT NULL
  `));

  let ran = 0;
  for (const automation of due) {
    if (!automation.project_id) continue;
    await runKodoAgent({
      db,
      workspaceId: automation.workspace_id,
      userEmail: automation.owner_email,
      projectId: automation.project_id,
      prompt: automation.prompt,
    });
    await db.prepare("UPDATE automations SET last_run_at = ? WHERE id = ?").bind(now(), automation.id).run();
    ran += 1;
  }

  return Response.json({ ran, checked: due.length });
}
