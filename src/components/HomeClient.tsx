"use client";

import { useEffect, useState, useCallback } from "react";
import { useFarcasterContext } from "@/components/Providers";
import GameCanvas from "@/components/Game/GameCanvas";
import ShopModal from "@/components/Shop/ShopModal";
import MainMenu from "@/components/Menu/MainMenu";
import GameOverMenu from "@/components/Menu/GameOverMenu";
import InventoryModal from "@/components/Menu/InventoryModal";
import LeaderboardModal from "@/components/Menu/LeaderboardModal";
import AchievementsModal from "@/components/Menu/AchievementsModal";
import StreakModal from "@/components/Streak/StreakModal";
import NoBirdWarning from "@/components/Menu/NoBirdWarning";
import { sdk } from "@farcaster/miniapp-sdk";
import { useGameData } from "@/hooks/useGameData";
import { GameScreen } from "@/types/game";

export default function HomeClient() {
    const { fid, displayName, pfpUrl, isLoading, isBaseApp } = useFarcasterContext();

    // Custom Hook for Game Data
    const {
        highScore,
        setHighScore,
        gamesPlayed,
        ownedSkus,
        setOwnedSkus,
        userAchievements,
        isSyncing,
        hasInitialized,
        syncUser,
        fetchAchievements,
        unlockAchievement
    } = useGameData({ fid, displayName });

    const [currentScore, setCurrentScore] = useState(0);

    // Screen State
    const [screen, setScreen] = useState<GameScreen>('menu');

    // Modals State
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
    const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
    const [isStreakOpen, setIsStreakOpen] = useState(false);
    const [isNoBirdWarningOpen, setIsNoBirdWarningOpen] = useState(false);

    // Skins State
    const [activeSkin, setActiveSkin] = useState('base_blue_jay');

    // Sync on load
    useEffect(() => {
        if (fid && displayName) {
            syncUser();
            fetchAchievements();
        }
    }, [fid, displayName, syncUser, fetchAchievements]);

    const handlePlay = useCallback(() => {
        // Prevent playing if data is not loaded yet
        if (isLoading || !hasInitialized || isSyncing) {
            return;
        }

        // Check if user owns at least one bird
        if (ownedSkus.length === 0) {
            setIsNoBirdWarningOpen(true);
            return;
        }

        setCurrentScore(0);
        setScreen('playing');

        // Unlock "first_game" achievement on first play
        if (gamesPlayed === 0) {
            unlockAchievement('first_game');
        }
    }, [gamesPlayed, unlockAchievement, ownedSkus, isLoading, hasInitialized, isSyncing]);

    const handleGameOver = (score: number) => {
        setCurrentScore(score);
        if (score > highScore) {
            setHighScore(score);
        }
        setScreen('gameover');
    };

    const handleMainMenu = () => {
        setScreen('menu');
    };

    const handleShare = useCallback(async () => {
        const text = `My record ${currentScore} in BaseBird! Can you beat it?`;
        const rawUrl = process.env.NEXT_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://basebird.space');
        const baseUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

        try {
            // Use composeCast for recast tracking
            const result = await sdk.actions.composeCast({
                text,
                embeds: [baseUrl]
            });

            // If user completed the cast, unlock recast achievement
            // In Base App, result.cast might be missing even on success
            if (result?.cast || isBaseApp) {
                unlockAchievement('recast_share');
            }
        } catch (err) {
            // Fallback to openUrl if composeCast fails
            const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${baseUrl}`;
            sdk.actions.openUrl(url);
        }
    }, [currentScore, unlockAchievement]);

    const handleAchievementMintSuccess = (achievementId: string) => {
        fetchAchievements();
    };

    // Don't block on loading - show UI immediately while context loads in background
    // if (isLoading) { ... } - REMOVED to prevent 20 second delay

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-900">
            {/* Player Info */}
            {screen !== 'menu' && (
                <div className="mb-4 text-white font-mono text-sm text-center flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2">
                        {pfpUrl && (
                            <img
                                src={pfpUrl}
                                alt="Profile"
                                className="w-5 h-5 rounded-full border border-cyan-500/50"
                            />
                        )}
                        <span>Player: {displayName} (FID: {fid})</span>
                    </div>
                    {(isSyncing || !hasInitialized) && <span className="text-xs text-gray-400">Syncing...</span>}
                </div>
            )}

            {/* Main Menu */}
            {screen === 'menu' && (
                <MainMenu
                    onPlay={handlePlay}
                    onOpenShop={() => setIsShopOpen(true)}
                    onOpenInventory={() => setIsInventoryOpen(true)}
                    onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
                    onOpenAchievements={() => setIsAchievementsOpen(true)}
                    onOpenStreak={() => setIsStreakOpen(true)}
                    playerName={displayName}
                    playerAvatar={pfpUrl}
                    highScore={highScore}
                    isLoading={isLoading || !hasInitialized || isSyncing}
                />
            )}

            {/* Game Screen */}
            {(screen === 'playing' || screen === 'gameover') && (
                <div className="relative w-full max-w-[430px] mx-auto h-[600px]">
                    <GameCanvas
                        fid={fid}
                        initialHighScore={highScore}
                        activeSkin={activeSkin}
                        onGameOver={handleGameOver}
                        isPlaying={screen === 'playing'}
                    />

                    {/* Game Over Overlay */}
                    {screen === 'gameover' && (
                        <GameOverMenu
                            score={currentScore}
                            highScore={highScore}
                            isNewRecord={currentScore >= highScore && currentScore > 0}
                            onPlayAgain={handlePlay}
                            onMainMenu={handleMainMenu}
                            onShare={handleShare}
                            onOpenShop={() => setIsShopOpen(true)}
                            onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
                        />
                    )}
                </div>
            )}

            {/* Modals */}
            <ShopModal
                isOpen={isShopOpen}
                onClose={() => setIsShopOpen(false)}
                ownedSkus={ownedSkus}
                activeSkin={activeSkin}
                onEquip={(sku) => setActiveSkin(sku)}
                onPurchaseSuccess={(sku) => {
                    syncUser();
                    setOwnedSkus(prev => [...prev, sku]);
                }}
            />

            <InventoryModal
                isOpen={isInventoryOpen}
                onClose={() => setIsInventoryOpen(false)}
                ownedSkus={ownedSkus}
                activeSkin={activeSkin}
                onEquip={(sku) => setActiveSkin(sku)}
            />

            <LeaderboardModal
                isOpen={isLeaderboardOpen}
                onClose={() => setIsLeaderboardOpen(false)}
                currentFid={fid}
            />

            <AchievementsModal
                isOpen={isAchievementsOpen}
                onClose={() => setIsAchievementsOpen(false)}
                userAchievements={userAchievements}
                onMintSuccess={handleAchievementMintSuccess}
                onUnlockAchievement={unlockAchievement}
            />

            <StreakModal
                isOpen={isStreakOpen}
                onClose={() => setIsStreakOpen(false)}
            />

            <NoBirdWarning
                isOpen={isNoBirdWarningOpen}
                onClose={() => setIsNoBirdWarningOpen(false)}
                onGoToShop={() => {
                    setIsNoBirdWarningOpen(false);
                    setIsShopOpen(true);
                }}
            />
        </main>
    );
}
