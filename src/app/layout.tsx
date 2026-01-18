import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

import DebugMonitor from "@/components/DebugMonitor";

const inter = Inter({ subsets: ["latin"] });

const appUrl = process.env.NEXT_PUBLIC_URL || "https://basebird.space";

const miniappEmbed = {
    version: "1",
    imageUrl: `${appUrl}/hero_new.png`,
    button: {
        title: "Play BaseBird",
        action: {
            type: "launch_miniapp",
            name: "BaseBird",
            url: appUrl,
            splashImageUrl: `${appUrl}/splash_new.png`,
            splashBackgroundColor: "#0A0B14"
        }
    }
};

export const metadata: Metadata = {
    title: "BaseBird - Farcaster Mini App",
    description: "A Farcaster BaseBird Mini App",
    other: {
        "fc:miniapp": JSON.stringify(miniappEmbed),
        "base:app_id": "696cba96f22fe462e74c1327",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                {/* Early Farcaster context detection */}
                <script src="/farcaster-init.js" />
            </head>
            <body className={inter.className}>
                <Providers>
                    <DebugMonitor />
                    {children}
                </Providers>
            </body>
        </html>
    );
}
