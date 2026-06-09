import type { Metadata } from "next";

import AppChrome from "@/components/AppChrome";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Knaq — Alert Triage",
  description: "IoT alert triage & resolution",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Providers>
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
