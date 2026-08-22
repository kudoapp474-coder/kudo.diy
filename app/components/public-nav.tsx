import { Menu } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function PublicNav() {
  return <header className="marketing-nav public-inner-nav"><Link className="marketing-logo" href="/"><BrandLogo /></Link><nav className="marketing-links"><Link href="/#models">Models</Link><Link href="/#product">Product</Link><Link href="/#enterprise">Enterprise</Link><Link href="/pricing">Pricing</Link><Link href="/docs">Docs</Link></nav><div className="marketing-actions"><Link className="nav-signin" href="/login">Sign in</Link><a className="nav-outline" href="mailto:hello@kodo.diy">Contact sales</a><Link className="nav-primary" href="/signup">Start building</Link></div><details className="mobile-marketing-menu"><summary><Menu size={20} /></summary><div><Link href="/#product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/docs">Docs</Link><Link href="/login">Sign in</Link><Link href="/signup">Start building</Link></div></details></header>;
}
