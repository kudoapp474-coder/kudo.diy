import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApiUser } from "../../lib/server-auth";
import { BrandLogo } from "../components/brand-logo";
import { InviteAccept } from "../components/invite-accept";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const auth = await requireApiUser();
  if (!auth) redirect("/login");
  if (!token) redirect("/workspace");

  return <main className="auth-page">
    <Link className="auth-logo" href="/"><BrandLogo /></Link>
    <section className="auth-card">
      <div className="auth-title"><h1>Workspace invite</h1><p>Joining as {auth.user.email}.</p></div>
      <InviteAccept token={token} />
    </section>
  </main>;
}
