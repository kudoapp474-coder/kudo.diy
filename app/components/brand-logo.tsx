import kodoLogo from "../assets/kodo-logo.png";

export function BrandLogo({ size = "default" }: { size?: "compact" | "default" | "large" }) {
  return (
    <span className={`brand-lockup brand-lockup-${size}`} aria-label="KODO">
      <img src={kodoLogo.src} alt="" aria-hidden="true" />
    </span>
  );
}
