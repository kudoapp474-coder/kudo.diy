import { ArrowRight } from "lucide-react";
import { AuthShell } from "../components/auth-shell";

export default function LoginPage() {
  return <AuthShell mode="login"><form className="auth-form"><label>Email address<input type="email" placeholder="you@company.com" /></label><label><span>Password <a href="#">Forgot password?</a></span><input type="password" placeholder="••••••••" /></label><a className="auth-submit" href="/signin-with-chatgpt?return_to=%2Fworkspace">Sign in securely <ArrowRight size={15} /></a></form></AuthShell>;
}
