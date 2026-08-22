import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "KODO — AI Coding Agent for Ambitious Software",
  description: "KODO plans, builds, tests, and ships ambitious software with you.",
  openGraph: {
    title: "KODO — Your AI coding agent",
    description: "Plan. Build. Test. Ship.",
    images: ["https://kudo-diy.digitalmediastep.chatgpt.site/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "KODO — Your AI coding agent",
    description: "Plan. Build. Test. Ship.",
    images: ["https://kudo-diy.digitalmediastep.chatgpt.site/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

function clerkRedirectOrigins() {
  const vercelOrigins = [process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
    .filter((url): url is string => Boolean(url))
    .map((url) => `https://${url}`);

  return Array.from(new Set([
    "https://kodo.diy",
    "https://www.kodo.diy",
    ...vercelOrigins,
  ]));
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const document = <html lang="en"><body>{children}</body></html>;
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? <ClerkProvider allowedRedirectOrigins={clerkRedirectOrigins()}>{document}</ClerkProvider>
    : document;
}
