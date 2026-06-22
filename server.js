const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const schedule = require('node-schedule');
const app = express();
const fs = require('fs');

app.use(cors());
app.use(express.json());

// Твои настройки
let appConfig = {
    meetingDate: "25 июня 2026",
    meetingTime: "17:00 – 19:30"
};

const ADMIN_KEY = "mysecret123";

// --- ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЕЙ (для попыток рулетки) ---
let usersData = {}; // Объект для хранения: { "Имя": { spins: 3 } }
const DB_FILE = 'users_db.json';

// Загрузка данных при старте
if (fs.existsSync(DB_FILE)) {
    usersData = JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(usersData, null, 2));
}

// --- API ДЛЯ РУЛЕТКИ ---
// 1. Регистрация пользователя
app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!usersData[name]) {
        usersData[name] = { spins: 1}; // Даем 1 попытки при первой регистрации
        saveDb();
    }
    res.json({ success: true, user: usersData[name] });
});

// 2. Получение данных пользователя
app.get('/api/spins/:name', (req, res) => {
    const name = req.params.name;
    res.json(usersData[name] || { spins: 0 });
});

// 3. Админ: Список всех пользователей
app.get('/api/users', (req, res) => {
    res.json(usersData);
});

// 5. Списание попытки после прокрута
app.post('/api/spend-spin', (req, res) => {
    const { name } = req.body;
    
    // Проверяем, существует ли пользователь в базе
    if (usersData[name]) {
        if (usersData[name].spins > 0) {
            usersData[name].spins -= 1; // Уменьшаем на 1
            saveDb(); // Сохраняем базу
            res.json({ success: true, newTotal: usersData[name].spins });
        } else {
            res.status(400).send("Нет доступных попыток");
        }
    } else {
        res.status(404).send("Пользователь не найден");
    }
});

// --- СТАРЫЙ ФУНКЦИОНАЛ ---

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
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const token = '8826215313:AAFs8n9UuyTEjoe3JIZe3J_KrO92jqa3BjE';
const myChatId = '743098995'; 
const bot = new TelegramBot(token, { polling: true });

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

app.post('/notify', (req, res) => {
    const { message } = req.body;
    bot.sendMessage(myChatId, message || "🔔 Новое уведомление");
    res.status(200).send('OK');
});

app.post('/set-reminder', (req, res) => {
    const { meetingDate } = req.body;
    
    if (!meetingDate) return res.status(400).send('Нет даты');

    const meetingTime = new Date(meetingDate);
    const notificationTime = new Date(meetingTime.getTime() - (8 * 60 * 60 * 1000));

    schedule.scheduleJob(notificationTime, () => {
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

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    saveUserChatId(chatId);
    bot.sendMessage(chatId, "Принято! Теперь ты будешь получать уведомления.");
});

cron.schedule('0 9 25 6 *', () => {
    bot.sendMessage(myChatId, "Сегодня тот самый день, буду тебя ждать! люблю ❤️");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

bot.onText(/\/test/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "✅ Тестовое уведомление работает! Если ты это видишь, значит всё настроено правильно.");
});

app.post('/api/complete-task', (req, res) => {
    const { name } = req.body;
    if (usersData[name]) {
        usersData[name].spins += 1;
        saveDb();
        res.json({ success: true, newTotal: usersData[name].spins });
    } else {
        res.status(404).send("Пользователь не найден");
    }
});

// Эндпоинт для обновления даты/времени и отправки уведомления
app.post('/api/update-meeting', (req, res) => {
    const { newDate, newTime } = req.body;
    
    // Формируем сообщение, если что-то изменилось
    let changes = [];
    if (newDate && newDate !== appConfig.meetingDate) {
        changes.push(`📅 Дата: была "${appConfig.meetingDate}", стала "${newDate}"`);
        appConfig.meetingDate = newDate;
    }
    if (newTime && newTime !== appConfig.meetingTime) {
        changes.push(`⏰ Время: было "${appConfig.meetingTime}", стало "${newTime}"`);
        appConfig.meetingTime = newTime;
    }

    // Если изменения были, шлем уведомление в телеграм
    if (changes.length > 0) {
        const message = `🔔 Внимание, изменения встречи!\n\n${changes.join('\n')}`;
        bot.sendMessage(myChatId, message); // myChatId должен быть определен у тебя в коде
        res.status(200).send({ status: 'success', message: 'Уведомление отправлено' });
    } else {
        res.status(200).send({ status: 'no_changes', message: 'Данные не изменились' });
    }
});
