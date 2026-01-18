"use client";

import React from 'react';

interface MainMenuProps {
    onPlay: () => void;
    onOpenShop: () => void;
    onOpenInventory: () => void;
    onOpenLeaderboard: () => void;
    onOpenAchievements: () => void;
    onOpenStreak: () => void;
    playerName?: string;
    playerAvatar?: string;
    highScore?: number;
    isLoading?: boolean;
}

export default function MainMenu({
    onPlay,
    onOpenShop,
    onOpenInventory,
    onOpenLeaderboard,
    onOpenAchievements,
    onOpenStreak,
    playerName,
    playerAvatar,
    highScore = 0,
    isLoading = false
}: MainMenuProps) {
    return (
        <div className="relative w-full max-w-[430px] mx-auto h-[600px] overflow-hidden border-2 border-cyan-400/30 bg-[#0A0B14] rounded-lg shadow-[0_0_20px_rgba(0,212,255,0.2)]">
            {/* New Crypto Background */}
            <div className="absolute inset-0">
                <img
                    src="/background_new.svg"
                    alt="Background"
                    className="w-full h-full object-cover opacity-80"
                />
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 pb-20">

                {/* Animated Bird (Recolored to Base Blue) */}
                <div className="animate-bird-bounce mb-6">
                    <svg width="60" height="60" viewBox="0 0 60 60">
                        {/* Body */}
                        <ellipse cx="30" cy="30" rx="25" ry="20" fill="#3B82F6" />
                        <ellipse cx="30" cy="35" rx="20" ry="12" fill="#60A5FA" opacity="0.5" />
                        {/* Eye */}
                        <ellipse cx="42" cy="28" rx="8" ry="8" fill="white" />
                        <circle cx="44" cy="28" r="4" fill="black" />
                        {/* Beak */}
                        <polygon points="50,30 65,28 50,34" fill="#F97316" />
                        {/* Wing */}
                        <ellipse cx="20" cy="35" rx="12" ry="6" fill="#1D4ED8" />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-5xl font-bold font-mono text-white mb-2 animate-title-glow drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
                    BASE
                </h1>
                <h1 className="text-5xl font-bold font-mono text-cyan-400 mb-8 animate-title-glow drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]">
                    BIRD
                </h1>

                {/* Player Info */}
                {playerName && (
                    <div className="bg-[#1E293B]/80 backdrop-blur-md border border-cyan-500/30 rounded-lg px-6 py-3 mb-8 shadow-[0_0_15px_rgba(0,212,255,0.1)]">
                        <div className="flex items-center justify-center gap-3 mb-1">
                            {playerAvatar ? (
                                <img
                                    src={playerAvatar}
                                    alt="Avatar"
                                    className="w-10 h-10 rounded-full border-2 border-cyan-400 shadow-[0_0_12px_rgba(0,212,255,0.5)] object-cover"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full border-2 border-cyan-400/50 bg-[#1E293B] flex items-center justify-center text-cyan-400">
                                    👤
                                </div>
                            )}
                            <p className="text-blue-100 font-mono text-sm">{playerName}</p>
                        </div>
                        <p className="text-cyan-400 font-mono text-xs font-bold tracking-wider text-center">🏆 RECORD: {highScore}</p>
                    </div>
                )}

                <div className="flex flex-col gap-3 w-full max-w-[280px]">
                    <button
                        onClick={onPlay}
                        disabled={isLoading}
                        className={`menu-btn menu-btn-primary animate-pulse-glow animate-float ${isLoading ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    >
                        {isLoading ? '⏳ LOADING...' : '▶ PLAY'}
                    </button>

                    <button
                        onClick={onOpenStreak}
                        className="menu-btn bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 border-2 border-orange-400 text-white font-bold font-mono text-base py-3 shadow-[0_0_15px_rgba(249,115,22,0.4)]"
                    >
                        🔥 REWARD STREAK
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={onOpenShop}
                            className="menu-btn menu-btn-secondary flex-1 text-base py-3 px-4"
                        >
                            🛒 SHOP
                        </button>
                        <button
                            onClick={onOpenInventory}
                            className="menu-btn menu-btn-purple flex-1 text-base py-3 px-4"
                        >
                            🎒 ITEMS
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onOpenAchievements}
                            className="menu-btn menu-btn-yellow flex-1 text-base py-3 px-3"
                        >
                            ⭐ AWARDS
                        </button>

                        <button
                            onClick={onOpenLeaderboard}
                            className="menu-btn menu-btn-blue flex-1 text-base py-3 px-2 text-sm"
                        >
                            🏆 RANK
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
