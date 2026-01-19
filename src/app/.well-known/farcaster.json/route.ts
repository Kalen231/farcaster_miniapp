import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // Get host from request headers
    const host = request.headers.get('host') || 'www.basebird.space';
    const isLocalhost = host.includes('localhost');

    // Build app URL
    let appUrl = isLocalhost
        ? `http://${host}`
        : `https://${host}`;

    const config = {
        // Farcaster account association for www.basebird.space (FID: 840807)
        accountAssociation: {
            "header": "eyJmaWQiOjg0MDgwNywidHlwZSI6ImF1dGgiLCJrZXkiOiIweGY4ZDJiMjYwRjBjOTFlZjgwNjU5YWNGQUFBOGE4NjhDMzRkZDRkNzEifQ",
            "payload": "eyJkb21haW4iOiJ3d3cuYmFzZWJpcmQuc3BhY2UifQ",
            "signature": "MJVIlv5XpCpzqAAtP6F3Akr5dlt6PSwQwZgg6NgGuVNsU/0Db+IczaWFIm8woRWgCA0Z0yq0ozw0JxRmMZBU9Rw="
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
