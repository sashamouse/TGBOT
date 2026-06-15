const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron');
const app = express();

// Твои данные из BotFather и userinfobot
const token = '8826215313:AAFs8n9UuyTEjoe3JIZe3J_KrO92jqa3BjE';
const myChatId = '743098995';

const bot = new TelegramBot(token, { polling: true });
app.use(express.json());

// Разрешаем запросы с любого сайта (это важно, чтобы сайт достучался)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// Маршрут, который будет пинговать сайт
app.post('/notify', (req, res) => {
    bot.sendMessage(myChatId, 'Она зашла на сайт! ❤️');
    res.status(200).send('OK');
});

// Напоминание в дату свидания
cron.schedule('0 9 25 6 *', () => {
    bot.sendMessage(myChatId, "Сегодня тот самый день, буду тебя ждать! люблю ❤️");
});

app.listen(3000, () => console.log('Сервер бота запущен на порту 3000'));