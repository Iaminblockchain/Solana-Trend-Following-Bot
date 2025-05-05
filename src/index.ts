import './server';
import './telegram/bot';

console.log('Trend Following Backend started!');
console.log('Telegram bot is running...');

// Example function
const greet = (name: string): string => {
  return `Hello, ${name}!`;
};

console.log(greet('Developer')); 