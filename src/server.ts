import express, { Request, Response, Application, RequestHandler } from 'express';
import cors from 'cors';
import { config } from './config/config';
import { telegramBot } from './telegram/bot';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to Trend Following API' });
});

interface SendMessageRequest {
  chatId: number;
  message: string;
}

// Example API endpoint to send message through Telegram bot
const sendMessageHandler: RequestHandler = async (req: Request<{}, {}, SendMessageRequest>, res: Response) => {
  try {
    const { chatId, message } = req.body;
    if (!chatId || !message) {
      res.status(400).json({ error: 'chatId and message are required' });
      return;
    }
    
    await telegramBot.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

app.post('/api/send-message', sendMessageHandler);

// Start server
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
}); 