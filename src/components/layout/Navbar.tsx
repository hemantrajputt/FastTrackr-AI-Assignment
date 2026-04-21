"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/upload", label: "Upload" },
    { href: "/households", label: "Households" },
    { href: "/insights", label: "Insights" },
    { href: "/ai-insights", label: "AI Insights" },
  ];

  return (
    <nav className="navbar">
      <Link href="/" className="nav-logo">
        <span>FastTrackr AI</span>
      </Link>
      <ul className="nav-links">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`nav-link ${pathname === link.href || pathname.startsWith(link.href + '/') ? "active" : ""}`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
