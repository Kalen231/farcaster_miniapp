# Smart Wallet / Base App Debugging Post-Mortem
**Date:** 2026-01-19
**Topic:** Mobile Smart Wallet Transaction Timeouts & Reverted Transaction Vulnerabiltiy

## 1. Initial Problem: Mobile Transaction Timeout
**User Report:**
> "Transaction timeout" error when minting a free bird in the Base App on mobile devices (Coinbase Smart Wallet).
> The transaction is successfully recorded on the blockchain (BaseScan shows success), but the application fails to find/process it.

**Diagnosis:**
- `ShopModal.tsx` was waiting for `transactionHash` in `callsStatus.receipts`.
- On mobile Smart Wallets, `callsStatus` would return `status: 'CONFIRMED'` but sometimes the receipts array was empty or the hash was not immediately available/standardized, leading to a frontend timeout (45s).

**First Attempted Fix (The "Fallback"):**
- **Changes:**
  - Modified frontend to trust `CONFIRMED` status even if `receipts` was missing/empty.
  - Passed `callId` (bundle ID) to backend instead of `txHash`.
  - Backend was updated to accept `callId` and **skip on-chain verification**, blindly trusting the wallet's `CONFIRMED` status.
- **Result:**
  - Solved the timeout. Purchases worked instantly on mobile.
  - **BUT:** Introduced a critical security vulnerability.

---

## 2. The Regression: Reverted Transactions Accepted
**User Report:**
> "The plan worked and free transaction passed, but now even if no funds... it sends transaction... bird is given... transaction erroneous."
> User provided a transaction hash (`0x7cdb...`) which showed "Success" on BaseScan (Top-level), but the internal execution (UserOp) actually **failed/reverted** due to insufficient funds (or other logic), yet the app granted the item.

**Root Cause Analysis:**
- Smart Wallet transactions (ERC-4337) are "Bundled".
- A "Success" status on the top-level transaction (bundler -> EntryPoint) only means the *bundler* was paid and the loop executed.
- The **internal** UserOperation can still fail (revert), returning `success=false` in the `UserOperationEvent`.
- **The Vulnerability:** Our "Fallback" logic blindly trusted `CONFIRMED` status (which maps to top-level success) and **skipped** checking the internal execution result.
- Since we granted the item without verifying the internal op, users received items for failed payments.

---

## 3. Final Solution: Strict On-Chain Verification
**Philosophy:** Never trust the client/wallet status blindly. Always verify execution success on-chain.

**Implementation Details:**

### Frontend (`src/components/Shop/ShopModal.tsx`)
1.  **Remove Insecure Fallback**: We no longer call `verifyBaseAppPurchase` if `txHash` is missing. We wait/retry until the hash is found.
2.  **Pass User Address**: We now pass `userAddress` (from `useAccount`) to the backend. This is crucial for distinguishing the user's operation within a shared bundle.

### Backend (`src/app/api/verify-transaction/route.ts`)
1.  **Strict Requirements**: `txHash` and `userAddress` are mandatory for Smart Wallet flows.
2.  **EntryPoint Log Parsing**:
    - We fetch the transaction receipt.
    - We check if the target is the EntryPoint contract (v0.6/v0.7).
    - We decode `receipt.logs` to find the `UserOperationEvent`.
3.  **Success Verification**:
    - We search for the event where `sender` matches `userAddress`.
    - We check the `success` boolean field in the event data.
    - **Logic:**
      - `success == true`: Transaction executed successfully. Grant item.
      - `success == false`: Transaction reverted internally. **Reject item.**
      - No log found: Fail (cannot verify).

**Code Reference (Verification Logic):**
```typescript
const userOpEventAbi = parseAbiItem('event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)');

// ... finding log ...
if (decodedLog.args.success === false) {
    throw new Error("Transaction execution failed (UserOp reverted)");
}
```

## Key Learnings for Future Agents
1.  **Bundled Transactions !== Simple Transactions**: A "Success" receipt status on BaseScan is NOT enough for Smart Wallets. You MUST check the `UserOperationEvent`.
2.  **Native Tokens**: Transferring native ETH (or 0 ETH mints) does not emit ERC20 Transfer events. The ONLY proof of execution success is the `UserOperationEvent` success flag.
3.  **Blind Trust is Dangerous**: Never assume `wallet_getCallsStatus` 'CONFIRMED' implies successful execution of your specific logic. It just means the UserOp was included in a block.
4.  **Identifiers**: `callId` is useful for tracking but `txHash` is required for verification.
