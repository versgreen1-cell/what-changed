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
    title: "WhatChanged — следите только за важными изменениями",
    description: "Мониторинг веб-страниц, который убирает технический шум и объясняет изменения простыми словами.",
    applicationName: "WhatChanged",
    openGraph: {
      title: "WhatChanged — страницы меняются, шум нет",
      description: "Цены, условия и политики — одна понятная фраза вместо сырого HTML diff.",
      type: "website",
      locale: "ru_RU",
      images: [{ url: "/og.png", width: 1734, height: 907, alt: "WhatChanged — узнавайте только о том, что важно" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "WhatChanged",
      description: "Узнавайте только о том, что важно.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
