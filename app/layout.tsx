import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "whatchanged.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  let metadataBase: URL;

  try {
    metadataBase = new URL(`${protocol}://${host}`);
  } catch {
    metadataBase = new URL("https://whatchanged.site");
  }

  return {
    metadataBase,
    title: "What changed — Know what changed. Skip the noise.",
    description: "Simple page monitoring that ignores technical noise and explains meaningful changes in plain English.",
    applicationName: "What changed",
    openGraph: {
      title: "What changed — Know what changed. Skip the noise.",
      description: "Track prices, policies and product pages without reading raw HTML diffs.",
      type: "website",
      locale: "en_US",
      images: [{ url: "/og-minimal.png", width: 1734, height: 907, alt: "What changed before and after price comparison" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "What changed",
      description: "Know what changed. Skip the noise.",
      images: ["/og-minimal.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
