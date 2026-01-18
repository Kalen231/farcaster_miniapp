"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSendTransaction } from 'wagmi';
import { useSendCalls, useCallsStatus } from 'wagmi/experimental';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { parseEther } from 'viem';
import { useMutation } from '@tanstack/react-query';
import { useFarcasterContext } from '@/components/Providers';
import { config } from '@/config/wagmi';
import { SKINS, Skin } from '@/config/skins';

interface ShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    ownedSkus: string[];
    activeSkin: string;
    onEquip: (sku: string) => void;
    onPurchaseSuccess: (sku: string) => void;
}

export default function ShopModal({
    isOpen,
    onClose,
    ownedSkus,
    activeSkin,
    onEquip,
    onPurchaseSuccess
}: ShopModalProps) {
    const { sendTransactionAsync } = useSendTransaction();
    const { sendCallsAsync } = useSendCalls();

    const { fid, isBaseApp } = useFarcasterContext();
    const adminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET || '0xf8d2b260F0c91ef80659acFAAA8a868C34dd4d71';

    // State for both flows
    const [buyingSkuId, setBuyingSkuId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [callId, setCallId] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // Watch Base App calls
    const { data: callsStatus } = useCallsStatus({
        id: callId || '',
        query: {
            enabled: !!callId,
            refetchInterval: (data) => data.state.data?.status === 'CONFIRMED' ? false : 1000,
        }
    });

    // Effect to handle Base App validation when call captures
    useEffect(() => {
        if (callId && callsStatus?.status === 'CONFIRMED' && buyingSkuId && !isVerifying) {
            console.log('✅ Base App Call Confirmed:', callId);
            verifyBaseAppPurchase(callId, buyingSkuId);
        }
    }, [callId, callsStatus?.status, buyingSkuId]);

    const verifyBaseAppPurchase = async (id: string, skuId: string) => {
        setIsVerifying(true);
        try {
            // For Smart Wallets, the Receipt might be different, but we send the call ID (or finding the hash)
            // Our backend likely expects a hash. 
            // callsStatus.receipts[0].transactionHash is what we need.
            const txHash = callsStatus?.receipts?.[0]?.transactionHash;

            if (!txHash) {
                console.warn("No hash found yet for call", id);
                return; // Wait for receipt
            }

            const skin = SKINS.find(s => s.skuId === skuId);
            const isMintable = skin?.isMintable;

            const response = await fetch('/api/verify-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fid,
                    txHash,
                    skuId,
                    isMintable,
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Verification failed');
            }

            // Success
            onPurchaseSuccess(skuId);
            setBuyingSkuId(null);
            setCallId(null);
        } catch (err: any) {
            console.error("Verification error:", err);
            setError(err.message);
            setBuyingSkuId(null); // Stop Loading
            setCallId(null);
        } finally {
            setIsVerifying(false);
        }
    };

    const purchaseMutation = useMutation({
        mutationKey: ['purchase'],
        mutationFn: async ({ skuId, priceInEth, isMintable }: { skuId: string; priceInEth: string; isMintable?: boolean }) => {
            if (!fid) throw new Error("User not logged in");
            if (!adminWallet) throw new Error("Admin wallet not configured");

            setBuyingSkuId(skuId);
            setError(null);
            setCallId(null);

            const value = isMintable ? parseEther("0") : parseEther(priceInEth);

            // BRANCH: Base App (sendCalls) vs Standard (sendTransaction)
            if (isBaseApp) {
                console.log('🔵 Using wallet_sendCalls for Base App');
                const id = await sendCallsAsync({
                    calls: [{
                        to: adminWallet as `0x${string}`,
                        value: value,
                        data: '0x'
                    }]
                });
                console.log('✅ Calls sent, ID:', id);
                setCallId(id); // Triggers the Effect
                return { method: 'calls', id, skuId };
            }

            // Standard Flow
            console.log('🟠 Using eth_sendTransaction');
            const hash = await sendTransactionAsync({
                to: adminWallet as `0x${string}`,
                value: value,
            });

            await waitForTransactionReceipt(config, { hash });

            // Verify
            const response = await fetch('/api/verify-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fid,
                    txHash: hash,
                    skuId,
                    isMintable,
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Verification failed');
            }

            return { hash, method: 'legacy', success: true, skuId };
        },
        onSuccess: (data) => {
            if (data.method === 'legacy') {
                onPurchaseSuccess(data.skuId);
                setBuyingSkuId(null);
            }
            // For 'calls', we stay in 'buying' state until the Effect helps us out
        },
        onError: (err) => {
            // Check for user rejection
            const isUserRejection =
                err.message.includes("User rejected the request") ||
                err.message.includes("User denied transaction signature") ||
                err.name === 'UserRejectedRequestError';

            if (isUserRejection) {
                console.log("Purchase cancelled by user");
                setBuyingSkuId(null);
                setCallId(null);
                return;
            }

            console.error("Purchase error:", err);
            setError(err.message.includes("Connector not connected")
                ? "Wallet disconnected. Please reload."
                : err.message);
            setBuyingSkuId(null);
            setCallId(null);
        }
    });

    if (!isOpen) return null;

    const handleBuy = (skin: Skin) => {
        purchaseMutation.mutate({
            skuId: skin.skuId,
            priceInEth: skin.price.toString(),
            isMintable: skin.isMintable
        });
    };

    const isOwned = (sku: string) => ownedSkus.includes(sku);
    const isActive = (sku: string) => activeSkin === sku;
    // Buying if Mutation Pending OR (we have a callID and verification is happening/pending)
    const isBuying = (sku: string) => buyingSkuId === sku;

    const formatPrice = (skin: Skin) => {
        if (skin.isMintable) {
            return 'MINT (gas only)';
        }
        return `${skin.price} ETH`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-lg bg-zinc-800 border-4 border-gray-400 p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.5)] max-h-[80vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center mb-4 border-b-2 border-gray-600 pb-2">
                    <h2 className="text-2xl font-bold font-mono text-yellow-400">
                        {isBaseApp ? '🔵 ' : ''}🐦 BIRD SHOP
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white font-mono text-xl font-bold"
                    >
                        [X]
                    </button>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-4 p-2 bg-red-900/50 border border-red-500 text-red-300 text-xs font-mono">
                        ❌ {error}
                    </div>
                )}

                {/* Status for Base App */}
                {callId && (
                    <div className="mb-4 p-2 bg-blue-900/50 border border-blue-500 text-blue-300 text-xs font-mono animate-pulse">
                        ⏳ Processing Transaction... {callsStatus?.status}
                    </div>
                )}

                {/* Items List - Scrollable */}
                <div className="space-y-3 overflow-y-auto pr-2 flex-1">

                    {SKINS.map((skin) => (
                        <div
                            key={skin.id}
                            className={`flex items-center justify-between p-3 bg-zinc-900 border-2 ${isActive(skin.skuId) ? 'border-green-500' : 'border-gray-600'
                                } transition-all`}
                        >
                            {/* Left: Image + Info */}
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 relative bg-zinc-700 border border-gray-500 rounded overflow-hidden">
                                    <Image
                                        src={skin.assetPath}
                                        alt={skin.name}
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-white font-mono text-sm">
                                        {skin.name}
                                    </h3>
                                    <p className="text-[10px] text-gray-400 font-mono leading-tight">
                                        {skin.visualFeature}
                                    </p>
                                    <p className={`text-xs font-mono mt-1 ${skin.isMintable ? 'text-green-300' : 'text-blue-300'
                                        }`}>
                                        {formatPrice(skin)}
                                    </p>
                                </div>
                            </div>

                            {/* Right: Action Buttons */}
                            <div className="text-right flex flex-col items-end min-w-[80px]">
                                {isOwned(skin.skuId) ? (
                                    isActive(skin.skuId) ? (
                                        <span className="text-green-400 font-bold font-mono text-xs">[EQUIPPED]</span>
                                    ) : (
                                        <button
                                            onClick={() => onEquip(skin.skuId)}
                                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white font-bold font-mono text-xs border-2 border-gray-500 active:translate-y-0.5"
                                        >
                                            EQUIP
                                        </button>
                                    )
                                ) : (
                                    <button
                                        onClick={() => handleBuy(skin)}
                                        disabled={isBuying(skin.skuId) || purchaseMutation.isPending}
                                        className={`px-3 py-1.5 font-bold font-mono text-xs border-2 active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${skin.isMintable
                                            ? 'bg-green-600 hover:bg-green-500 text-white border-green-400'
                                            : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400'
                                            }`}
                                    >
                                        {isBuying(skin.skuId)
                                            ? (skin.isMintable ? 'MINTING...' : 'BUYING...')
                                            : (skin.isMintable ? 'MINT' : 'BUY')}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                </div>

                {/* Footer Info */}
                <div className="mt-4 pt-3 border-t border-gray-600">
                    <p className="text-[10px] text-gray-500 font-mono text-center">
                        🎮 First bird required to play! Mint the Base Blue Jay for FREE (gas only)
                    </p>
                </div>

            </div>
        </div>
    );
}
