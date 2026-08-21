import { SignUp } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { AuthShell } from "../components/auth-shell";

export default function SignupPage() {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <main className="clerk-auth-page"><SignUp routing="hash" fallbackRedirectUrl="/onboarding" signInUrl="/login" /></main>;
  }
  return <AuthShell mode="signup"><form className="auth-form"><label>Work email<input type="email" placeholder="you@company.com" /></label><label>Password<input type="password" placeholder="At least 8 characters" /></label><a className="auth-submit" href="/signin-with-chatgpt?return_to=%2Fonboarding">Create secure workspace <ArrowRight size={15} /></a><small>By continuing, you agree to KODO&apos;s Terms and Privacy Policy.</small></form></AuthShell>;
}
