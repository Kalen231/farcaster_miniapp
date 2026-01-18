import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get('fid');

    if (!fid) {
        return NextResponse.json({ error: 'FID required' }, { status: 400 });
    }

    try {
        // Fetch from public Hub
        const response = await fetch(`https://nemes.farcaster.xyz:2281/v1/userDataByFid?fid=${fid}&user_data_type=1`);

        if (!response.ok) {
            return NextResponse.json({ error: 'Hub error' }, { status: response.status });
        }

        const data = await response.json();
        const pfpUrl = data?.data?.userDataBody?.value;

        return NextResponse.json({ pfpUrl });
    } catch (error) {
        console.error('PFP Fetch Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
