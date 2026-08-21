"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useState } from "react";

export function AccountMenu({
  displayName,
  email,
  initial,
}: {
  displayName: string;
  email: string;
  initial: string;
}) {
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <details className="product-account-menu">
      <summary className="user-avatar" aria-label={`Open account menu for ${displayName}`}>
        {initial}
      </summary>
      <div className="product-account-popover">
        <header>
          <span className="account-menu-avatar">{initial}</span>
          <div>
            <b>{displayName}</b>
            <small>{email}</small>
          </div>
        </header>
        <a href="/settings"><Settings size={15} /> Account settings</a>
        <button type="button" onClick={handleSignOut} disabled={signingOut}>
          <LogOut size={15} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        <footer><UserRound size={12} /> Secure account</footer>
      </div>
    </details>
  );
}
