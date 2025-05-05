import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'MONGODB_URL'] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN as string,
  mongodbUrl: process.env.MONGODB_URL as string,
} as const; 