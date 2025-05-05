// tx-helpers.ts
import { Connection, ParsedTransactionWithMeta, PublicKey, SignatureStatus } from "@solana/web3.js";

/*   error codes & texts  */
export const ERR_1001 = "Unknown instruction error";
export const ERR_1002 = "Provided owner is not allowed";
export const ERR_1003 = "custom program error: insufficient funds";
export const ERR_1011 = "Not known Error";

export const ERR_6002 = "slippage: Too much SOL required to buy the given amount of tokens.";
export const ERR_6003 = "slippage: Too little SOL received to sell the given amount of tokens.";

/*  helpers  */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getTokenBalance = (tokenBalances: any[], mint: string, owner: string): number => {
    for (const t of tokenBalances) {
        if (t?.mint === mint && t?.owner === owner) {
            return Number(t.uiTokenAmount?.uiAmount ?? 0);
        }
    }
    return 0;
};

// status poller
export async function getStatusTxnRetry(
    connection: Connection,
    txsig: string,
    maxRetries = 20,
    retrySleep = 500
): Promise<{ success: true; txsig: string } | { success: false; error: string; errorcode: number }> {
    console.log(`try get_status_txn ${txsig} (max ${maxRetries}, every ${retrySleep} ms)`);

    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            const { value } = await connection.getSignatureStatuses([txsig], { searchTransactionHistory: true });
            const status = value[0] as SignatureStatus | null;

            if (!status) {
                await sleep(retrySleep);
                continue; // not found yet
            }
            if (status.err == null) {
                console.log(`Transaction confirmed ${txsig}`);
                return { success: true, txsig };
            }

            /*  decode InstructionError  */
            const err = status.err as any;
            if (err?.InstructionError) {
                const [, detail] = err.InstructionError as [number, any];

                if (detail === "IllegalOwner") {
                    return { success: false, error: ERR_1002, errorcode: 1002 };
                }

                if (typeof detail === "object" && "Custom" in detail) {
                    switch (detail.Custom) {
                        case 1:
                            return { success: false, error: ERR_1003, errorcode: 1003 };
                        case 6002:
                            return { success: false, error: ERR_6002, errorcode: 6002 };
                        case 6003:
                            return { success: false, error: ERR_6003, errorcode: 6003 };
                        default:
                            return { success: false, error: ERR_1001, errorcode: 1001 };
                    }
                }

                return { success: false, error: ERR_1011, errorcode: 1011 };
            }

            /*  any other error  */
            console.error(`Unexpected tx error`, { err, txsig });
            return { success: false, error: ERR_1001, errorcode: 1001 };
        } catch (e) {
            console.error(`confirmation attempt ${retry}: ${String(e)}`);
            await sleep(retrySleep);
        }
    }
    console.error(`Max retries reached. Tx confirmation failed ${txsig}`);
    return { success: false, error: "could not confirm in time", errorcode: 1003 };
}

// get tx info
export async function getTxInfo(txsig: string, connection: Connection, tokenMint: string): Promise<Record<string, any> | null> {
    const maxRetries = 20;
    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            const txn = await connection.getTransaction(txsig, {
                commitment: "finalized",
                maxSupportedTransactionVersion: 0,
            });
            if (txn) {
                // make it plain JSON – easier to work with & log
                const plain = JSON.parse(JSON.stringify(txn)) as ParsedTransactionWithMeta;
                return plain as any;
            }
            await sleep(1000);
        } catch (e) {
            console.error(`getTxInfo retry ${retry} – ${String(e)}`);
            await sleep(1000);
        }
    }
    console.error(`No tx info after ${maxRetries} retries – ${txsig}`);
    return null;
}

//  get tx info + metrics
export async function getTxInfoMetrics(txsig: string, connection: Connection, tokenMint: string) {
    const tx = await getTxInfo(txsig, connection, tokenMint);
    if (!tx) {
        console.log(`no tx info for ${tokenMint}`);
        return;
    }
    const metrics = extractTransactionMetrics(tx, tokenMint);
    return metrics;
}

// extract metrics
export function extractTransactionMetrics(tx: any, tokenMint: string): Record<string, any> {
    const message = tx.transaction?.message;
    if (!message) return {};

    const accountKeys: string[] = message.accountKeys || [];
    const ownerPubkey = accountKeys[0] ?? "";

    const meta = tx.meta ?? {};
    const preBalances: number[] = meta.preBalances || [];
    const postBalances: number[] = meta.postBalances || [];
    const fee: number = meta.fee || 0;
    const computeUnits = meta.computeUnitsConsumed ?? null;

    const preTokenBalances = meta.preTokenBalances || [];
    const postTokenBalances = meta.postTokenBalances || [];

    const preToken = getTokenBalance(preTokenBalances, tokenMint, ownerPubkey);
    const postToken = getTokenBalance(postTokenBalances, tokenMint, ownerPubkey);
    const tokenBalanceChange = postToken - preToken;

    /* SOL spent (lamports SOL) */
    let solBalanceChange = 0;
    if (preBalances.length && postBalances.length) {
        solBalanceChange = Math.abs(preBalances[0] - postBalances[0]) / 1e9;
    }

    /* rent paid for creating a new token account (optional) */
    let tokenCreationCost = 0;
    for (let i = 0; i < postBalances.length; i++) {
        if (preBalances[i] === 0 && postBalances[i] > 0) {
            tokenCreationCost = postBalances[i] / 1e9;
            break;
        }
    }

    const price = Math.abs(tokenBalanceChange) > 1e-6 ? solBalanceChange / Math.abs(tokenBalanceChange) : null;

    return {
        owner_pubkey: ownerPubkey,
        token: tokenMint,
        token_balance_change: tokenBalanceChange,
        transaction_fee: fee,
        sol_balance_change: solBalanceChange,
        token_creation_cost: tokenCreationCost,
        compute_units_consumed: computeUnits,
        price,
    };
}
