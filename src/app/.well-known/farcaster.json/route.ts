import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // Get host from request headers or env
    const host = request.headers.get('host');
    const isLocalhost = host?.includes('localhost');

    // URL Resolution priorities:
    // 1. NEXT_PUBLIC_URL (set manually in Vercel or .env)
    // 2. Fallback to current host
    let appUrl = process.env.NEXT_PUBLIC_URL || host || 'basebird.space';

    // Ensure URL has proper protocol
    if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
        appUrl = isLocalhost ? `http://${appUrl}` : `https://${appUrl}`;
    }

    const config = {
        accountAssociation: {
            "header": "eyJmaWQiOjg0MDgwNywidHlwZSI6ImF1dGgiLCJrZXkiOiIweGY4ZDJiMjYwRjBjOTFlZjgwNjU5YWNGQUFBOGE4NjhDMzRkZDRkNzEifQ",
            "payload": "eyJkb21haW4iOiJiYXNlYmlyZC5zcGFjZSJ9",
            "signature": "LlNeC3G+mmkBwzDkuO7KwpOUUdCyZFp2J90fp36g7jJxiPWutCw2Nx8SMhEQDYy9Q5o80+F2C7ZBeN2Nq/cLoRw="
        },
        miniapp: {
            version: "1",
            name: "Base Bird",
            homeUrl: appUrl,
            iconUrl: `${appUrl}/icon_new.png`,
            splashImageUrl: `${appUrl}/splash_new.png`,
            splashBackgroundColor: "#0A0B14",
            subtitle: "Flap to earn on Base",
            description: "Crypto Flappy Bird on Base blockchain. Collect bird skins as NFTs, compete on leaderboards, earn achievements. Fly through the neon datastream!",
            screenshotUrls: [
                `${appUrl}/screenshot_gameplay.png`,
                `${appUrl}/screenshot_gameover.png`,
                `${appUrl}/screenshot_shop.png`
            ],
            primaryCategory: "games",
            tags: ["games", "nft", "base", "flappy", "crypto"],
            heroImageUrl: `${appUrl}/hero_new.png`,
            tagline: "Fly through the blockchain",
            ogTitle: "Base Bird - Flap to Earn",
            ogDescription: "Crypto Flappy Bird on Base. Mint bird skins, compete on leaderboards, unlock achievements!",
            ogImageUrl: `${appUrl}/hero_new.png`,
            webhookUrl: `${appUrl}/api/webhook`,
            requiredChains: [
                "eip155:8453"
            ],
            requiredCapabilities: [
                "actions.composeCast",
                "wallet.getEthereumProvider"
            ]
        }
    };

    return NextResponse.json(config, {
        headers: {
            'Cache-Control': 'no-store, max-age=0',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
