import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface TokenBalance {
  address: string;
  balance: number;
  decimals: number;
}

interface TokenMetadata {
  decimals: number;
  symbol?: string;
  name?: string;
}

export const getTokenMetaData = async (connection: Connection, mintAddress: string): Promise<TokenMetadata | null> => {
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(mintAddress));
    if (!info.value) return null;
    
    const data = (info.value.data as any).parsed.info;
    return {
      decimals: data.decimals,
      symbol: data.symbol,
      name: data.name
    };
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    return null;
  }
};

export const getAllTokensWithBalance = async (connection: Connection, owner: PublicKey): Promise<TokenBalance[]> => {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    });

    return tokenAccounts.value
      .map(account => ({
        address: account.account.data.parsed.info.mint,
        balance: account.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals
      }))
      .filter(token => token.balance > 0);
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return [];
  }
}; 