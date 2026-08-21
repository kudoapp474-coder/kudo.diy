import { Menu } from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function PublicNav() {
  return <header className="marketing-nav public-inner-nav"><a className="marketing-logo" href="/"><BrandLogo /></a><nav className="marketing-links"><a href="/#models">Models</a><a href="/#product">Product</a><a href="/#enterprise">Enterprise</a><a href="/pricing">Pricing</a><a href="/docs">Docs</a></nav><div className="marketing-actions"><a className="nav-signin" href="/login">Sign in</a><a className="nav-outline" href="mailto:hello@kodo.diy">Contact sales</a><a className="nav-primary" href="/signup">Start building</a></div><details className="mobile-marketing-menu"><summary><Menu size={20} /></summary><div><a href="/#product">Product</a><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/login">Sign in</a><a href="/signup">Start building</a></div></details></header>;
}
