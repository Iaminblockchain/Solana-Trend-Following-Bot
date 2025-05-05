import { AddressLookupTableAccount, BlockhashWithExpiryBlockHeight, Connection, Keypair, PublicKey, PublicKeyInitData, SignatureStatus, SystemProgram, TransactionConfirmationStatus, TransactionInstruction, TransactionMessage, TransactionSignature, VersionedTransaction } from '@solana/web3.js';
import { getTokenMetaData } from './token';
import axios from 'axios';
import bs58 from "bs58";
import { SOLANA_CONNECTION } from '.';
import { getStatusTxnRetry } from './txhelpers';

export const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";

const endpoints = [
    "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
];


const jito_Validators = [
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
];

const MAX_ATTEMPTS = 3;
const MAX_RETRIES = 3;


const JITO_TIP = 1000000
const isJito = true;

interface SwapResult {
    confirmed: boolean;
    txSignature: string | null;
    tokenAmount: number;
    txLink?: string;
}

async function sendWithRetries(
    connection: Connection,
    payer: Keypair,
    instructions: TransactionInstruction[],
    lookupTables: AddressLookupTableAccount[],
    useJito: boolean
): Promise<{ confirmed: boolean; signature: string | null }> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("processed");
        const messageV0 = new TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: blockhash,
            instructions,
        }).compileToV0Message(lookupTables);
        const tx = new VersionedTransaction(messageV0);
        tx.sign([payer]);

        // call Jito or RPC
        const raw = useJito
            ? await jito_executeAndConfirm(connection, tx, payer, { blockhash, lastValidBlockHeight }, JITO_TIP)
            : await submitAndConfirm(tx);

        // normalize signature to string|null
        const confirmed = raw.confirmed;
        const signature = raw.signature ?? null;

        if (confirmed) {
            return { confirmed, signature };
        }

        console.log(`Attempt ${attempt} failed, retrying…`);
    }

    return { confirmed: false, signature: null };
}

export const submitAndConfirm = async (transaction: VersionedTransaction) => {
    try {
        const signature = await SOLANA_CONNECTION.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true,
            maxRetries: MAX_RETRIES,
        });
        await confirmTransaction(SOLANA_CONNECTION, signature);

        return {
            confirmed: true,
            signature,
        };
    } catch (e) {
        console.error("Error om submit:", { error: e });
        return {
            confirmed: false,
        };
    }
};


export async function getRandomValidator() {
    const res = jito_Validators[Math.floor(Math.random() * jito_Validators.length)];
    return new PublicKey(res);
}

export async function jito_executeAndConfirm(
    CONNECTION: Connection,
    transaction: VersionedTransaction,
    payer: Keypair,
    lastestBlockhash: BlockhashWithExpiryBlockHeight,
    jitofee: number
) {
    const jito_validator_wallet = await getRandomValidator();
    try {
        const jitoFee_message = new TransactionMessage({
            payerKey: payer.publicKey,
            recentBlockhash: lastestBlockhash.blockhash,
            instructions: [
                SystemProgram.transfer({
                    fromPubkey: payer.publicKey,
                    toPubkey: jito_validator_wallet,
                    lamports: jitofee,
                }),
            ],
        }).compileToV0Message();

        const jitoFee_transaction = new VersionedTransaction(jitoFee_message);
        jitoFee_transaction.sign([payer]);
        const txSignature = bs58.encode(transaction.signatures[0]);
        const serializedJitoFeeTransaction = bs58.encode(jitoFee_transaction.serialize());
        const serializedTransaction = bs58.encode(transaction.serialize());
        const final_transaction = [serializedJitoFeeTransaction, serializedTransaction];
        const requests = endpoints.map((url) =>
            axios.post(url, {
                jsonrpc: "2.0",
                id: 1,
                method: "sendBundle",
                params: [final_transaction],
            })
        );
        const res = await Promise.all(requests.map((p) => p.catch((e) => e)));
        const success_res = res.filter((r) => !(r instanceof Error));
        if (success_res.length > 0) {
            console.log("Jito validator accepted the tx");
            return await jito_confirm(CONNECTION, txSignature, lastestBlockhash);
        } else {
            console.log("No Jito validators accepted the tx");
            return { confirmed: false, signature: txSignature };
        }
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.error("Failed to execute the jito transaction");
        } else {
            console.error("Error during jito transaction execution: ", { error: e });
        }
        return { confirmed: false, signature: null };
    }
}

async function jito_confirm(CONNECTION: Connection, signature: string, latestBlockhash: BlockhashWithExpiryBlockHeight) {
    console.log("Confirming the jito transaction...");
    await confirmTransaction(SOLANA_CONNECTION, signature);
    return { confirmed: true, signature };
}

const confirmTransaction = async (
    connection: Connection,
    signature: TransactionSignature,
    desiredConfirmationStatus: TransactionConfirmationStatus = "confirmed",
    timeout: number = 30000,
    pollInterval: number = 1000,
    searchTransactionHistory: boolean = false
): Promise<SignatureStatus> => {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const { value: statuses } = await connection.getSignatureStatuses([signature], { searchTransactionHistory });

        if (!statuses || statuses.length === 0) {
            throw new Error("Failed to get signature status");
        }

        const status = statuses[0];

        if (status === null) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
        }

        if (status.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }

        if (status.confirmationStatus && status.confirmationStatus === desiredConfirmationStatus) {
            return status;
        }

        if (status.confirmationStatus === "finalized") {
            return status;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
};

export const jupiter_swap = async (
    connection: Connection,
    privateKey: string,
    inputMint: string,
    outputMint: string,
    amount: number,
    swapMode: 'ExactIn' | 'ExactOut',
    useJito: boolean = true,
    slippage: number = 500
): Promise<SwapResult> => {
    try {
        console.log(`jupiter_swap ${inputMint} ${outputMint} ${amount} ${swapMode}`);
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        const quoteUrl =
            `https://api.jup.ag/swap/v1/quote` +
            `?inputMint=${inputMint}` +
            `&outputMint=${outputMint}` +
            `&amount=${Math.floor(amount)}` +
            `&slippageBps=${slippage}` +
            `&swapMode=${swapMode}`;

        console.log("Fetching quote from Jupiter:", quoteUrl);
        const quoteResponse = await fetch(quoteUrl).then((res) => res.json()) as SwapQuote;
        if (quoteResponse.error) throw new Error("Failed to fetch quote response");
        console.log("Quote response received", quoteResponse);

        // Get token decimals from metadata
        const tokenMetaData = await getTokenMetaData(connection, outputMint);
        if (!tokenMetaData?.decimals) {
            console.error("Failed to get token decimals", { outputMint });
            throw new Error("Failed to get token decimals");
        }

        // Get raw token amount from quote response
        const tokenAmount = parseInt(quoteResponse.outAmount);
        console.log("Raw token amount:", tokenAmount);

        const { instructions, addressLookupTableAccounts } = await getSwapInstructions(quoteResponse, keypair.publicKey.toBase58());

        const latestBlockhash = await connection.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
            payerKey: keypair.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions,
        }).compileToV0Message(addressLookupTableAccounts);

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([keypair]);

        const result = await sendWithRetries(connection, keypair, instructions, addressLookupTableAccounts, isJito);

        if (!result.confirmed) {
            console.error("All attempts failed");
            return { confirmed: false, txSignature: null, tokenAmount: 0 };
        }

        // After retry, check if confirmed and validate with getStatusTxnRetry
        if (result.confirmed && result.signature) {
            const status = await getStatusTxnRetry(connection, result.signature);
            if (!status.success) {
                console.error("Txn failed after retry:", status);
                return { confirmed: false, txSignature: result.signature, tokenAmount: 0 };
            }
        }

        if (result.confirmed) {
            console.log("Solana: confirmed");
            const txLink = `https://solscan.io/tx/${result.signature}`;
            return { confirmed: true, txSignature: result.signature, tokenAmount, txLink };
        }

        return { confirmed: false, txSignature: null, tokenAmount: 0 };
    } catch (error) {
        console.error("jupiter swap:", { error });
        console.error(inputMint);
        console.error(outputMint);
        console.error(amount);
        console.error(swapMode);
        console.error(error);
        return { confirmed: false, txSignature: null, tokenAmount: 0 };
    }
};

interface SwapQuote {
    inAmount: string;
    outAmount: string;
    [key: string]: any;
}

interface SwapInstructionsResponse {
    tokenLedgerInstruction?: any[];
    computeBudgetInstructions: any[];
    setupInstructions: any[];
    swapInstruction: any;
    cleanupInstruction: any;
    addressLookupTableAddresses: string[];
    error?: string;
}

async function getSwapInstructions(
    quote: SwapQuote,
    userPublicKey: string,
    wrapAndUnwrapSol = true
): Promise<{
    instructions: TransactionInstruction[];
    addressLookupTableAccounts: AddressLookupTableAccount[];
}> {
    // 1) fetch the raw instruction payloads
    const res = await fetch("https://api.jup.ag/swap/v1/swap-instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey,
            wrapAndUnwrapSol,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: {
                    maxLamports: 50_000_000,
                    priorityLevel: "veryHigh",
                },
            },
        }),
    }).then((r) => r.json() as Promise<SwapInstructionsResponse>);

    if (res.error) throw new Error("Swap-instructions error: " + res.error);

    // 2) helper to decode each payload into a TransactionInstruction
    const deserialize = (instr: any) =>
        new TransactionInstruction({
            programId: new PublicKey(instr.programId),
            keys: instr.accounts.map((a: any) => ({
                pubkey: new PublicKey(a.pubkey),
                isSigner: a.isSigner,
                isWritable: a.isWritable,
            })),
            data: Buffer.from(instr.data, "base64"),
        });

    // 3) turn each section into real instructions
    const allInstr = [
        ...res.computeBudgetInstructions.map(deserialize),
        ...res.setupInstructions.map(deserialize),
        deserialize(res.swapInstruction),
        deserialize(res.cleanupInstruction),
    ];

    // 4) fetch and deserialize any address‑lookup tables
    const lookupAccounts = await Promise.all(
        res.addressLookupTableAddresses.map(async (addr: PublicKeyInitData) => {
            const info = await SOLANA_CONNECTION.getAccountInfo(new PublicKey(addr));
            if (!info) return null;
            return new AddressLookupTableAccount({
                key: new PublicKey(addr),
                state: AddressLookupTableAccount.deserialize(info.data),
            });
        })
    );

    return {
        instructions: allInstr,
        addressLookupTableAccounts: lookupAccounts.filter((x: any): x is AddressLookupTableAccount => !!x),
    };
}