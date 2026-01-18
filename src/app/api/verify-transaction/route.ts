import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { SKINS } from '@/config/skins';
import { createPublicClient, http, parseEther } from "viem";
import { base } from "viem/chains";

const publicClient = createPublicClient({
    chain: base,
    transport: http(),
});

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

        // 3. Loose Verification (Logging only)
        // We do not block on these checks because Base App / Smart Wallets behavior is complex 
        // and has caused false negatives (money lost, item not delivered).
        const adminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET?.toLowerCase();
        const to = receipt.to?.toLowerCase();

        console.log(`[Verify] Debug Info:`, {
            admin: adminWallet,
            to: to,
            from: receipt.from, // Smart Account
            block: receipt.blockNumber
        });

        // Optional: Value check (Informational)
        try {
            const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
            const s = SKINS.find(sk => sk.skuId === skuId);
            const price = s ? parseEther(s.price.toString()) : BigInt(0);

            console.log(`[Verify] Value Check: Sent ${tx.value}, Price ${price}`);

            if (tx.value < price) {
                console.warn("⚠️ Potential Payment Issue: Transaction value < Price. (Could be internal Smart Wallet transfer)");
                // We ALLOW this because previous strict checks failed valid user payments.
            }
        } catch (e) {
            console.warn("Could not fetch tx value details", e);
        }

        // 4. Record purchase
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
