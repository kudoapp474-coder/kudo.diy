import Image from "next/image";
import kodoLogo from "../assets/kodo-logo.png";

export function BrandLogo({ size = "default" }: { size?: "compact" | "default" | "large" }) {
  return (
    <span className={`brand-lockup brand-lockup-${size}`} aria-label="KODO">
      <Image src={kodoLogo} alt="" aria-hidden="true" priority />
    </span>
  );
}
