"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '../config/wagmi';
import { WagmiConnectionManager } from './WagmiConnectionManager';

const queryClient = new QueryClient();

interface FarcasterContextType {
    fid?: number;
    displayName?: string;
    username?: string;
    pfpUrl?: string;
    isLoading: boolean;
    isSDKLoaded: boolean;
    isDevMode: boolean;
    isBaseApp: boolean;
}

const FarcasterContext = createContext<FarcasterContextType>({
    isLoading: true,
    isSDKLoaded: false,
    isDevMode: false,
    isBaseApp: false,
});

export function Providers({ children }: { children: React.ReactNode }) {
    const [isSDKLoaded, setIsSDKLoaded] = useState(false);
    const [context, setContext] = useState<any>(null);
    const [isDevMode, setIsDevMode] = useState(false);
    const [isBaseApp, setIsBaseApp] = useState(false);

    useEffect(() => {
        // Fallback context for local development
        const fallbackContext = {
            user: {
                fid: 999999,
                username: "local_dev_user",
                displayName: "🧪 Dev Mode",
                pfpUrl: "",
            },
        };

        const initSDK = async () => {
            const startTime = (window as any).__FARCASTER_INIT_START__ || Date.now();
            const contextDetected = !!(window as any).__FARCASTER_CONTEXT_DETECTED__;

            // CRITICAL: Call ready() IMMEDIATELY - this hides splash screen
            // Do NOT wait for context - that causes the 20 second delay!
            if (contextDetected) {
                try {
                    await sdk.actions.ready();
                    console.log(`✅ sdk.actions.ready() called in ${Date.now() - startTime}ms`);
                } catch (e) {
                    console.log('⏭️ ready() call failed:', e);
                }
            }

            // Mark SDK as loaded IMMEDIATELY after ready() - don't block on context
            setIsSDKLoaded(true);

            // Now load context asynchronously - this can take time but UI is visible
            try {
                const isMiniApp = await sdk.isInMiniApp();

                if (isMiniApp) {
                    const ctx = await sdk.context;
                    console.log('✅ Farcaster context loaded', ctx);
                    setContext(ctx);

                    // Detect Base App (clientFid 309857)
                    if (ctx?.client?.clientFid === 309857) {
                        console.log('🔵 Running in Base App!');
                        setIsBaseApp(true);
                    }

                    // Fix: Fetch PFP if missing (common in Base App)
                    if (ctx?.user?.fid && !ctx.user.pfpUrl) {
                        try {
                            const res = await fetch(`/api/user/pfp?fid=${ctx.user.fid}`);
                            const data = await res.json();
                            if (data.pfpUrl) {
                                setContext((prev: any) => ({
                                    ...prev,
                                    user: {
                                        ...prev?.user,
                                        pfpUrl: data.pfpUrl
                                    }
                                }));
                            }
                        } catch (e) {
                            console.error('Failed to fetch PFP fallback', e);
                        }
                    }
                } else {
                    console.log('🎮 Not in Mini App, using dev mode');
                    setIsDevMode(true);
                    setContext(fallbackContext);
                }
            } catch (error) {
                console.log('🎮 Detection failed, using dev mode');
                setIsDevMode(true);
                setContext(fallbackContext);
            }
        };

        initSDK();
    }, []);

    const value: FarcasterContextType = {
        fid: context?.user?.fid,
        displayName: context?.user?.displayName || context?.user?.username,
        username: context?.user?.username,
        pfpUrl: context?.user?.pfpUrl,
        isLoading: !context,
        isSDKLoaded,
        isDevMode,
        isBaseApp,
    };

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <FarcasterContext.Provider value={value}>
                    <WagmiConnectionManager />
                    {children}
                </FarcasterContext.Provider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}

export const useFarcasterContext = () => useContext(FarcasterContext);
