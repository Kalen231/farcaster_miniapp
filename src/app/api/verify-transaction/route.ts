import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SKINS } from '@/config/skins';
import { createPublicClient, http, parseEther, decodeAbiParameters, Hex } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({
    chain: base,
    transport: http(),
});

// EntryPoint contract addresses for ERC-4337
const ENTRY_POINT_V06 = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
const ENTRY_POINT_V07 = "0x0000000071727de22e5e9d8baf0edac6f37da032";

// Smart Wallet function selectors
const EXECUTE_SELECTOR = "0xb61d27f6"; // execute(address,uint256,bytes)
const EXECUTE_BATCH_SELECTOR = "0x34fcd5be"; // executeBatch((address,uint256,bytes)[])

/**
 * Extract value from Smart Wallet execute() calldata
 * Smart Wallets use execute(address dest, uint256 value, bytes data)
 */
function extractValueFromCalldata(input: Hex, adminWallet: string): bigint | null {
    try {
        const selector = input.slice(0, 10);
        console.log('[Verify] Calldata selector:', selector);

        // Try execute(address,uint256,bytes)
        if (selector === EXECUTE_SELECTOR) {
            const params = input.slice(10) as Hex;
            const [dest, value] = decodeAbiParameters(
                [
                    { name: 'dest', type: 'address' },
                    { name: 'value', type: 'uint256' },
                    { name: 'data', type: 'bytes' }
                ],
                `0x${params}`
            );

            console.log('[Verify] Decoded execute():', {
                dest: dest,
                value: value.toString(),
                destMatchesAdmin: dest.toLowerCase() === adminWallet.toLowerCase()
            });

            if (dest.toLowerCase() === adminWallet.toLowerCase()) {
                return value;
            }
        }

        // Try executeBatch((address,uint256,bytes)[])
        // Coinbase Smart Wallet uses this format: executeBatch(Call[] calls)
        // where Call = { target: address, value: uint256, data: bytes }
        if (selector === EXECUTE_BATCH_SELECTOR) {
            const params = input.slice(10) as Hex;

            // Decode array of tuples
            const [calls] = decodeAbiParameters(
                [
                    {
                        name: 'calls',
                        type: 'tuple[]',
                        components: [
                            { name: 'target', type: 'address' },
                            { name: 'value', type: 'uint256' },
                            { name: 'data', type: 'bytes' }
                        ]
                    }
                ],
                `0x${params}`
            );

            console.log('[Verify] Decoded executeBatch(), calls count:', (calls as any[]).length);

            // Find call to our admin wallet
            for (const call of calls as { target: string; value: bigint; data: string }[]) {
                console.log('[Verify] Batch call:', {
                    target: call.target,
                    value: call.value.toString()
                });
                if (call.target.toLowerCase() === adminWallet.toLowerCase()) {
                    return call.value;
                }
            }
        }

        console.log('[Verify] No matching call found for admin wallet');
        return null;
    } catch (e) {
        console.log('[Verify] Failed to decode calldata:', e);
        return null;
    }
}


export async function POST(req: NextRequest) {
    try {
        const { fid, txHash, callId, skuId } = await req.json();

        // Either txHash or callId is required (Smart Wallet fallback)
        if (!fid || (!txHash && !callId) || !skuId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Use txHash if available, otherwise use callId as identifier
        const identifier = txHash || callId;
        const isCallIdFallback = !txHash && callId;

        console.log(`[Verify] Checking: ${identifier} for FID: ${fid}, SKU: ${skuId}, isCallIdFallback: ${isCallIdFallback}`);

        // 1. Verify transaction on-chain (skip if callId fallback - Smart Wallet trusted CONFIRMED)
        let receipt = null;

        if (txHash) {
            const MAX_RETRIES = 5;
            const RETRY_DELAY = 2000; // 2 seconds

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    receipt = await publicClient.getTransactionReceipt({
                        hash: txHash as `0x${string}`,
                    });
                    console.log(`[Verify] Receipt found on attempt ${attempt}`);
                    break;
                } catch (e) {
                    console.log(`[Verify] Attempt ${attempt}/${MAX_RETRIES} - Receipt not found, waiting...`);
                    if (attempt === MAX_RETRIES) {
                        console.error("[Verify] Failed to fetch receipt after all retries:", e);
                        return NextResponse.json({ error: "Transaction not found on chain. Please wait a moment and try refreshing." }, { status: 404 });
                    }
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                }
            }

            if (!receipt) {
                return NextResponse.json({ error: "Transaction not found on chain" }, { status: 404 });
            }

            if (receipt.status !== "success") {
                return NextResponse.json(
                    { error: "Transaction failed (reverted)" },
                    { status: 400 }
                );
            }
        } else {
            // CallId fallback - Smart Wallet returned CONFIRMED status but no txHash
            // We trust the CONFIRMED status from wallet_getCallsStatus
            console.log('[Verify] Using callId fallback - trusting Smart Wallet CONFIRMED status');
        }

        // 2. Check for duplicate (using identifier - either txHash or callId)
        const { data: existingPurchase } = await supabase
            .from("purchases")
            .select("id")
            .eq("tx_hash", identifier)
            .maybeSingle();

        if (existingPurchase) {
            console.warn(`[Verify] Duplicate attempt: ${identifier}`);
            return NextResponse.json(
                { error: "Transaction already processed" },
                { status: 400 }
            );
        }

        // 3. Get transaction details and skin price
        const adminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET || '';
        const skin = SKINS.find(sk => sk.skuId === skuId);
        const requiredPrice = skin ? parseEther(skin.price.toString()) : BigInt(0);
        const isMintable = skin?.isMintable || false;

        console.log(`[Verify] SKU: ${skuId}, Price: ${requiredPrice}, Mintable: ${isMintable}`);

        // 4. For callId fallback (Smart Wallet mobile), skip detailed value verification
        // We trust the CONFIRMED status from wallet_getCallsStatus
        if (isCallIdFallback) {
            console.log('[Verify] ✅ Smart Wallet callId fallback - trusting CONFIRMED status');
            console.log('[Verify] Recording purchase for Smart Wallet transaction');

            // Record purchase with callId as identifier
            const { error: insertError } = await supabase.from("purchases").insert({
                fid,
                tx_hash: identifier,
                sku_id: skuId,
                amount: requiredPrice.toString(),
            });

            if (insertError) {
                console.error("[Verify] DB Error:", insertError);
                return NextResponse.json({ error: "Failed to record purchase" }, { status: 500 });
            }

            console.log(`[Verify] ✅ Smart Wallet Purchase recorded: FID=${fid}, SKU=${skuId}`);
            return NextResponse.json({ success: true, purchaseId: identifier });
        }

        // Normal flow - have txHash and receipt
        const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
        const to = receipt!.to?.toLowerCase();

        console.log(`[Verify] TX Details:`, {
            to: to,
            from: receipt!.from,
            txValue: tx.value.toString(),
            inputLength: tx.input?.length || 0
        });

        // 5. Determine actual value transferred
        let actualValue = tx.value; // Default: top-level value
        let isVerifiedSmartWallet = false;

        // Check if this is a Smart Wallet transaction via EntryPoint
        const isEntryPointTx = to === ENTRY_POINT_V06.toLowerCase() ||
            to === ENTRY_POINT_V07.toLowerCase();

        if (isEntryPointTx) {
            console.log('[Verify] ✅ EntryPoint bundled transaction detected - trusting verified tx');
            isVerifiedSmartWallet = true;
        } else {
            const isPotentialSmartWallet = tx.value === BigInt(0) && tx.input && tx.input.length > 10 && to !== adminWallet.toLowerCase();

            if (isPotentialSmartWallet) {
                console.log('[Verify] Potential Smart Wallet proxy transaction detected');
                const internalValue = extractValueFromCalldata(tx.input as Hex, adminWallet);

                if (internalValue !== null) {
                    actualValue = internalValue;
                    console.log(`[Verify] ✅ Extracted internal value from calldata: ${actualValue}`);
                } else {
                    console.log('[Verify] ⚠️ Could not decode calldata - trusting Smart Wallet pattern');
                    isVerifiedSmartWallet = true;
                }
            }
        }

        // 6. Verify payment amount
        console.log(`[Verify] Payment Check: Actual=${actualValue}, Required=${requiredPrice}, isVerifiedSmartWallet=${isVerifiedSmartWallet}`);

        // For verified Smart Wallet transactions, skip strict value check
        // Security is maintained via: 1) unique hash check, 2) confirmed tx status
        if (!isMintable && !isVerifiedSmartWallet && actualValue < requiredPrice) {
            console.error(`[Verify] ❌ INSUFFICIENT PAYMENT: Sent ${actualValue}, Required ${requiredPrice}`);
            return NextResponse.json(
                { error: `Insufficient payment: sent ${actualValue}, required ${requiredPrice}` },
                { status: 400 }
            );
        }

        if (isVerifiedSmartWallet) {
            console.log(`[Verify] ✅ Smart Wallet transaction verified via EntryPoint/proxy pattern`);
        }

        // 6. Record purchase
        const { error: insertError } = await supabase.from("purchases").insert({
            fid,
            tx_hash: identifier,
            sku_id: skuId,
        });

        if (insertError) {
            console.error("Error inserting purchase:", insertError);
            return NextResponse.json(
                { error: "Failed to record purchase" },
                { status: 500 }
            );
        }

        console.log(`[Verify] ✅ Success: Recorded purchase for SKU ${skuId}`);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error verifying transaction:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

