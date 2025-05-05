import { Connection } from "@solana/web3.js";
import { config } from "../config/config";

export const SOLANA_CONNECTION = new Connection(config.solanaRpcUrl, {
    wsEndpoint: config.solanaWssUrl,
    commitment: "confirmed",
});