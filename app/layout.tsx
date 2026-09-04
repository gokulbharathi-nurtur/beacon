import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { BeaconMark } from "@/app/components/BeaconMark";
import { SectionNav } from "@/app/components/SectionNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Beacon",
  description:
    "Capture and diff window.dataLayer against saved reference templates",
};

// Applies the persisted/system theme before paint, so there's no light->dark flash.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-360 items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <BeaconMark className="size-7 rounded-md" />
              <span className="flex items-baseline gap-1.5">
                <span className="font-semibold tracking-tight">Beacon</span>
              </span>
            </Link>
            <SectionNav />
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-360 flex-1 px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
