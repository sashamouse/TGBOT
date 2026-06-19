const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const schedule = require('node-schedule'); // Нужно для точных уведомлений по дате
const app = express();
const fs = require('fs');

app.use(cors()); // Это разрешит сайту на Netlify общаться с твоим сервером
app.use(express.json()); // Чтобы сервер понимал данные, которые ты будешь слать (JSON)

// Твои настройки
let appConfig = {
    meetingDate: "25 июня 2026",
    meetingTime: "17:00 – 19:30"
};

const ADMIN_KEY = "mysecret123"; // Придумай свой секретный код!

// Получить настройки (GET)
app.get('/config', (req, res) => {
    res.json(appConfig);
});

// Обновить настройки (POST)
app.post('/update-config', (req, res) => {
    const { key, date, time } = req.body;
    
    if (key !== ADMIN_KEY) {
        return res.status(403).send("Ошибка: Неверный ключ");
    }

    if (date) appConfig.meetingDate = date;
    if (time) appConfig.meetingTime = time;

    res.send("Настройки обновлены!");
});

// CORS блоки
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const token = '8826215313:AAFs8n9UuyTEjoe3JIZe3J_KrO92jqa3BjE';
const myChatId = '743098995'; // Твой ID остается здесь
const bot = new TelegramBot(token, { polling: true });

// --- ФУНКЦИИ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ---
function saveUserChatId(chatId) {
    const filePath = 'users.json';
    let users = [];
    if (fs.existsSync(filePath)) {
        try {
            users = JSON.parse(fs.readFileSync(filePath));
        } catch (e) { users = []; }
    }
    if (!users.includes(chatId)) {
        users.push(chatId);
        fs.writeFileSync(filePath, JSON.stringify(users));
        console.log(`Пользователь ${chatId} сохранен.`);
    }
}

// --- ТВОЙ КОД: Прием уведомлений от сайта ---
app.post('/notify', (req, res) => {
    const { message } = req.body;
    bot.sendMessage(myChatId, message || "🔔 Новое уведомление");
    res.status(200).send('OK');
});

// --- НОВЫЙ КОД: Прием даты встречи и планирование уведомления ---
app.post('/set-reminder', (req, res) => {
    const { meetingDate } = req.body; // Ожидаем дату, например "2026-06-27T16:00:00"
    
    if (!meetingDate) return res.status(400).send('Нет даты');

    const meetingTime = new Date(meetingDate);
    // Вычитаем 8 часов (8 * 60 * 60 * 1000 миллисекунд)
    const notificationTime = new Date(meetingTime.getTime() - (8 * 60 * 60 * 1000));

    schedule.scheduleJob(notificationTime, () => {
        // Отправляем всем, кто нажал /start (кто есть в users.json)
        if (fs.existsSync('users.json')) {
            const users = JSON.parse(fs.readFileSync('users.json'));
            users.forEach(id => {
                bot.sendMessage(id, `🔔 Напоминание! Встреча через 8 часов: ${meetingDate}`);
            });
        }
    });

    console.log(`Уведомление запланировано на: ${notificationTime}`);
    res.status(200).send({ status: 'success', time: notificationTime });
});

// --- НОВЫЙ КОД: Обработка команды /start ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    saveUserChatId(chatId);
    bot.sendMessage(chatId, "Принято! Теперь ты будешь получать уведомления.");
});

// --- ТВОЙ КОД: Таймер на 25 июня ---
cron.schedule('0 9 25 6 *', () => {
    bot.sendMessage(myChatId, "Сегодня тот самый день, буду тебя ждать! люблю ❤️");
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

// Команда для проверки: напиши /test в боте
bot.onText(/\/test/, (msg) => {
    const chatId = msg.chat.id;
    // Шлем тестовое сообщение именно тому, кто написал /test
    bot.sendMessage(chatId, "✅ Тестовое уведомление работает! Если ты это видишь, значит всё настроено правильно.");
});
