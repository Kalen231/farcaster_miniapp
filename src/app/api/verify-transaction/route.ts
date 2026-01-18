import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createPublicClient, http } from "viem";
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
        const receipt = await publicClient.getTransactionReceipt({
            hash: txHash as `0x${string}`,
        });

        if (receipt.status !== "success") {
            return NextResponse.json(
                { error: "Transaction failed or not found" },
                { status: 400 }
            );
        }

        // 2. Check recipient
        const adminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET?.toLowerCase();
        const to = receipt.to?.toLowerCase();
        const from = receipt.from?.toLowerCase();

        console.log(`[Verify] AdminWallet: ${adminWallet}`);
        console.log(`[Verify] Receipt TO: ${to}`);
        console.log(`[Verify] Receipt FROM: ${from}`);

        if (!adminWallet) {
            console.error("NEXT_PUBLIC_ADMIN_WALLET is not set");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Standard EOA Check
        const isStandardDirect = to === adminWallet;

        // Smart Wallet Check (EIP-4337 EntryPoints)
        const ENTRY_POINT_V6 = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
        const ENTRY_POINT_V7 = "0x0000000071727de22e5e9d8baf0edac6f37da032";
        const isSmartWalletEntryPoint = to === ENTRY_POINT_V6 || to === ENTRY_POINT_V7;

        // Smart Wallet Check (Self-call / Proxy execution)
        // For some wallets, the 'to' is the wallet contract itself (same as from, or a related proxy)
        const isSmartWalletDirect = to === from;

        if (!isStandardDirect && !isSmartWalletEntryPoint && !isSmartWalletDirect) {
            console.warn(`[Verify] Recipient mismatch. Expected ${adminWallet}, got ${to}`);
            return NextResponse.json(
                { error: `Invalid recipient: observed ${to}. Expected admin wallet or EntryPoint.` },
                { status: 400 }
            );
        }

        console.log(`[Verify] Recipient check passed (${isStandardDirect ? 'Direct' : 'SmartWallet'})`);

        // 3. Check for duplicate hash
        const { data: existingPurchase, error: fetchError } = await supabase
            .from("purchases")
            .select("id")
            .eq("tx_hash", txHash)
            .maybeSingle();

        if (existingPurchase) {
            return NextResponse.json(
                { error: "Transaction already processed" },
                { status: 400 }
            );
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

        console.log(`[Verify] Success: Recorded purchase for SKU ${skuId}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error verifying transaction:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
