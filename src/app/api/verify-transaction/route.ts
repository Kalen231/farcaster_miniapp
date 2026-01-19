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
        const { fid, txHash, skuId } = await req.json();

        if (!fid || !txHash || !skuId) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        console.log(`[Verify] Checking tx: ${txHash} for FID: ${fid}, SKU: ${skuId}`);

        // 1. Verify transaction on-chain
        let receipt;
        try {
            receipt = await publicClient.getTransactionReceipt({
                hash: txHash as `0x${string}`,
            });
        } catch (e) {
            console.error("Failed to fetch receipt:", e);
            return NextResponse.json({ error: "Transaction not found on chain" }, { status: 404 });
        }

        if (receipt.status !== "success") {
            return NextResponse.json(
                { error: "Transaction failed (reverted)" },
                { status: 400 }
            );
        }

        // 2. Check for duplicate hash (CRITICAL)
        const { data: existingPurchase } = await supabase
            .from("purchases")
            .select("id")
            .eq("tx_hash", txHash)
            .maybeSingle();

        if (existingPurchase) {
            console.warn(`[Verify] Duplicate hash attempt: ${txHash}`);
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

        const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
        const to = receipt.to?.toLowerCase();

        console.log(`[Verify] TX Details:`, {
            to: to,
            from: receipt.from,
            txValue: tx.value.toString(),
            inputLength: tx.input?.length || 0
        });

        // 4. Determine actual value transferred
        let actualValue = tx.value; // Default: top-level value

        // Check if this is a Smart Wallet transaction
        // CRITICAL: Coinbase Smart Wallets DON'T always go to EntryPoint!
        // They can also go to the user's Smart Wallet proxy contract directly.
        // Detection: tx.value === 0 AND has calldata (input)
        const isEntryPointTx = to === ENTRY_POINT_V06.toLowerCase() ||
            to === ENTRY_POINT_V07.toLowerCase();

        // Smart Wallet = either EntryPoint OR (zero value + calldata + not direct to admin)
        const isPotentialSmartWallet = isEntryPointTx ||
            (tx.value === BigInt(0) && tx.input && tx.input.length > 10 && to !== adminWallet.toLowerCase());

        if (isPotentialSmartWallet && tx.input) {
            console.log('[Verify] Potential Smart Wallet transaction detected (EntryPoint or zero-value with calldata)');
            console.log('[Verify] isEntryPointTx:', isEntryPointTx, 'to:', to);

            // Try to extract value from execute() calldata
            const internalValue = extractValueFromCalldata(tx.input as Hex, adminWallet);

            if (internalValue !== null) {
                actualValue = internalValue;
                console.log(`[Verify] ✅ Extracted internal value from calldata: ${actualValue}`);
            } else {
                // If we can't decode execute(), check internal transactions via trace
                console.log('[Verify] Could not extract from execute() calldata, will check payment amount');
            }
        }

        // 5. Verify payment amount
        console.log(`[Verify] Payment Check: Actual=${actualValue}, Required=${requiredPrice}`);

        if (!isMintable && actualValue < requiredPrice) {
            console.error(`[Verify] ❌ INSUFFICIENT PAYMENT: Sent ${actualValue}, Required ${requiredPrice}`);
            return NextResponse.json(
                { error: `Insufficient payment: sent ${actualValue}, required ${requiredPrice}` },
                { status: 400 }
            );
        }

        // 6. Record purchase
        const { error: insertError } = await supabase.from("purchases").insert({
            fid,
            tx_hash: txHash,
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

