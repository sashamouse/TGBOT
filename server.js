const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron'); // Исправили: подключили модуль для таймера
const app = express();

// CORS блоки (разрешаем сайту слать запросы на бот)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Чтение JSON-данных от сайта
app.use(express.json());

const token = '8826215313:AAFs8n9UuyTEjoe3JIZe3J_KrO92jqa3BjE';
const myChatId = '743098995';
const bot = new TelegramBot(token, { polling: true });

// Прием уведомлений от сайта
app.post('/notify', (req, res) => {
    const { message } = req.body;
    
    // Бот отправит ТО, что прислал сайт ("Она зашла на сайт" или "она ввела пароль")
    // Если вдруг прилетит пустой запрос, отправится дефолтное уведомление
    bot.sendMessage(myChatId, message || "🔔 Новое уведомление");
    
    res.status(200).send('OK');
});

// Таймер на 25 июня (оставляем, раз он тебе нужен)
cron.schedule('0 9 25 6 *', () => {
    bot.sendMessage(myChatId, "Сегодня тот самый день, буду тебя ждать! люблю ❤️");
});

// Запуск сервера (СТРОГО ОДИН РАЗ, БЕЗ ДУБЛЕЙ)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));