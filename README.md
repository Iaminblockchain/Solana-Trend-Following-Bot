# Trend Following Backend

This is the backend for the Trend Following application, which includes both a web API and a Telegram bot.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3000
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
NODE_ENV=development
```

3. To get a Telegram bot token:
   - Open Telegram and search for @BotFather
   - Start a chat and use the `/newbot` command
   - Follow the instructions to create your bot
   - Copy the token provided by BotFather to your `.env` file

## Development

Run the development server with hot reloading:
```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start the development server with nodemon
- `npm run build` - Build the TypeScript project
- `npm start` - Run the compiled JavaScript

## API Endpoints

- `GET /` - Welcome message
- `POST /api/send-message` - Send a message through the Telegram bot
  - Body: `{ "chatId": number, "message": string }`

## Telegram Bot Commands

- `/start` - Start the bot
- `/help` - Show help message 