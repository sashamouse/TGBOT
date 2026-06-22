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
let usersData = {}; 
const DB_FILE = 'users_db.json';

// Загрузка данных при старте
if (fs.existsSync(DB_FILE)) {
    try {
        usersData = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        usersData = {};
    }
}

function saveDb() {
    fs.writeFileSync(DB_FILE, JSON.stringify(usersData, null, 2));
}

// --- API ДЛЯ РУЛЕТКИ ---

app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!usersData[name]) {
        usersData[name] = { spins: 1 };
        saveDb();
    }
    res.json({ success: true, user: usersData[name] });
});

app.get('/api/spins/:name', (req, res) => {
    const name = req.params.name;
    res.json(usersData[name] || { spins: 0 });
});

app.get('/api/users', (req, res) => {
    res.json(usersData);
});

app.post('/api/add-spins', (req, res) => {
    const { name, amount, key } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).send("Ошибка: Неверный ключ");
    if (!usersData[name]) usersData[name] = { spins: 0 };
    usersData[name].spins += parseInt(amount);
    saveDb();
    res.json({ success: true, newTotal: usersData[name].spins });
});

app.post('/api/spend-spin', (req, res) => {
    const { name } = req.body;
    if (usersData[name] && usersData[name].spins > 0) {
        usersData[name].spins -= 1; 
        saveDb(); 
        res.json({ success: true, newTotal: usersData[name].spins });
    } else {
        res.status(400).send("Нет доступных попыток");
    }
});

app.post('/api/complete-task', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).send("Нет имени");
    if (!usersData[name]) usersData[name] = { spins: 0 };
    usersData[name].spins += 1;
    saveDb();
    res.json({ success: true, newTotal: usersData[name].spins });
});

// --- УПРАВЛЕНИЕ КОНФИГУРАЦИЕЙ ВСТРЕЧИ ---

app.get('/config', (req, res) => {
    res.json(appConfig);
});

// Обновленный эндпоинт с раздельными уведомлениями
app.post('/update-config', (req, res) => {
    const { key, date, time } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).send("Ошибка: Неверный ключ");
    
    if (date && date !== appConfig.meetingDate) {
        appConfig.meetingDate = date;
        bot.sendMessage(myChatId, `📅 Внимание! Она изменила ДАТУ встречи на: ${date}`);
    }

    if (time && time !== appConfig.meetingTime) {
        appConfig.meetingTime = time;
        bot.sendMessage(myChatId, `⏰ Внимание! Она изменила ВРЕМЯ встречи на: ${time}`);
    }

    res.send("Настройки обновлены!");
});

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// --- НАСТРОЙКИ ТЕЛЕГРАМ БОТА ---
const token = '8826215313:AAFs8n9UuyTEjoe3JIZe3J_KrO92jqa3BjE';
const myChatId = '743098995'; 
const bot = new TelegramBot(token, { polling: true });

// Умная функция сохранения: записывает ID, Никнейм и Имя
function saveUserChatId(chatId, username, firstName) {
    const filePath = 'users.json';
    let users = [];
    if (fs.existsSync(filePath)) {
        try { users = JSON.parse(fs.readFileSync(filePath)); } catch (e) { users = []; }
    }
    
    // Пересобираем базу, если в ней были старые ID без объектов
    users = users.map(u => typeof u === 'object' ? u : { id: u, username: 'нет ника', firstName: 'Пользователь' });

    const existingUser = users.find(u => u.id.toString() === chatId.toString());
    if (!existingUser) {
        users.push({
            id: chatId,
            username: username || 'нет ника',
            firstName: firstName || 'Без имени'
        });
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        console.log(`Пользователь ${chatId} (${username}) сохранен.`);
    } else {
        // Если ник или имя обновились в телеграме — перезаписываем актуальные данные
        if (username && existingUser.username !== username) {
            existingUser.username = username;
            existingUser.firstName = firstName || existingUser.firstName;
            fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        }
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
            users.forEach(u => { 
                const targetId = typeof u === 'object' ? u.id : u;
                bot.sendMessage(targetId, `🔔 Напоминание! Встреча через 8 часов: ${meetingDate}`); 
            });
        }
    });
    console.log(`Уведомление запланировано на: ${notificationTime}`);
    res.status(200).send({ status: 'success', time: notificationTime });
});

// --- ОБРАБОТКА КОМАНД БОТА ---

// Когда она нажимает кнопку на сайте и запускает бота
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username ? `@${msg.from.username}` : 'нет ника';
    const firstName = msg.from.first_name || 'Без имени';

    // Сохраняем в базу с ником и именем
    saveUserChatId(chatId, username, firstName);
    
    // Ответ ей в чат
    bot.sendMessage(chatId, "Принято! Теперь ты будешь получать уведомления.");

    // МГНОВЕННОЕ УВЕДОМЛЕНИЕ ТЕБЕ ОБ ЭТОМ!
    const adminNotice = `🔔 Она (или другой пользователь) подписалась на уведомления о встрече!\n\n👤 Имя: ${firstName}\nНик: ${username}\nID: \`${chatId}\``;
    bot.sendMessage(myChatId, adminNotice, { parse_mode: 'Markdown' });
});

// Админ-команда: Список всех пользователей с именами и никами
bot.onText(/\/chats/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== myChatId) return;

    if (fs.existsSync('users.json')) {
        let users = JSON.parse(fs.readFileSync('users.json'));
        if (users.length === 0) {
            return bot.sendMessage(myChatId, "👥 Список пользователей пуст.");
        }
        
        let responseMessage = "👥 **Список пользователей в базе:**\n\n";
        users.forEach((u, index) => {
            if (typeof u === 'object') {
                responseMessage += `${index + 1}. ✨ **${u.firstName}** | Ник: ${u.username} | ID: \`${u.id}\`\n`;
            } else {
                responseMessage += `${index + 1}. ID: \`${u}\` (старый формат, без имени)\n`;
            }
        });
        responseMessage += "\nЧтобы отправить сообщение конкретному человеку, скопируй его ID и напиши:\n`/send [ID] [Текст]`";
        bot.sendMessage(myChatId, responseMessage, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(myChatId, "Файл users.json еще не создан.");
    }
});

// Админ-команда: Отправить личное сообщение по ID
bot.onText(/\/send (\d+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== myChatId) return;

    const targetChatId = match[1];
    const textToSend = match[2];

    bot.sendMessage(targetChatId, textToSend)
        .then(() => {
            bot.sendMessage(myChatId, `✅ Сообщение успешно отправлено на ID ${targetChatId}`);
        })
        .catch((err) => {
            bot.sendMessage(myChatId, `❌ Ошибка отправки: ${err.message}`);
        });
});

// Админ-команда: Рассылка сразу всем
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== myChatId) return;

    const textToSend = match[1];

    if (fs.existsSync('users.json')) {
        const users = JSON.parse(fs.readFileSync('users.json'));
        users.forEach(u => {
            const targetId = typeof u === 'object' ? u.id : u;
            bot.sendMessage(targetId, textToSend)
                .catch((err) => console.log(`Ошибка рассылки для ${targetId}:`, err.message));
        });
        bot.sendMessage(myChatId, `📢 Рассылка успешно отправлена всем!`);
    } else {
        bot.sendMessage(myChatId, "База пуста, слать некому.");
    }
});

cron.schedule('0 9 25 6 *', () => {
    bot.sendMessage(myChatId, "Сегодня тот самый день, буду тебя ждать! люблю ❤️");
});

bot.onText(/\/test/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "✅ Тестовое уведомление работает! Если ты это видишь, значит всё настроено правильно.");
});

const PORT = process.env.PORT || 3000;

// --- СИСТЕМА ПЕРЕСЫЛКИ: НИК - ID - КОНТЕНТ ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // 1. Игнорируем твои собственные сообщения бота, чтобы не было зацикливания
    // (убедись, что твоя переменная айдишника называется именно myChatId, либо замени на свою)
    if (chatId === myChatId) return;

    // 2. Игнорируем команду /start, у нее своя логика
    if (msg.text && msg.text.startsWith('/start')) return;

    // 3. Собираем инфу об отправителе
    const username = msg.from.username ? `@${msg.from.username}` : `Нет ника (${msg.from.first_name || 'Пользователь'})`;
    const userId = msg.from.id;

    // 4. Определяем, что именно прислали
    let contentType = '📝 ТЕКСТ';
    if (msg.photo) contentType = '📸 ФОТО';
    else if (msg.video_note) contentType = '⭕ КРУЖОЧЕК';
    else if (msg.voice) contentType = '🎤 ГОЛОСОВОЕ СООБЩЕНИЕ';
    else if (msg.video) contentType = '🎥 ВИДЕО';
    else if (msg.sticker) contentType = '✨ СТИКЕР';
    else if (msg.document) contentType = '📁 ФАЙЛ';

    // 5. Формируем красивую плашку для тебя
    let infoMessage = `📩 *Новое сообщение!*\n\n`;
    infoMessage += `👤 *Ник:* ${username}\n`;
    infoMessage += `🆔 *ID:* \`${userId}\`\n`;
    infoMessage += `📦 *Что прислали:* ${contentType}`;

    // Если это обычный текст — сразу добавляем его в эту же карточку
    if (msg.text) {
        infoMessage += `\n\n💬 *Текст:* ${msg.text}`;
    }

    try {
        // Отправляем тебе карточку с инфой
        await bot.sendMessage(myChatId, infoMessage, { parse_mode: 'Markdown' });

        // Если прислали НЕ текст (а фото, кружочек, голос и т.д.), форвардим его следом
        if (!msg.text) {
            await bot.forwardMessage(myChatId, chatId, msg.message_id);
        }
    } catch (err) {
        console.error('Ошибка пересылки сообщения:', err);
    }
});

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

// --- БУДИЛЬНИК ДЛЯ СЕРВЕРА (без установки библиотек) ---
const https = require('https');
setInterval(() => {
    https.get('https://tgbot-5mm5.onrender.com', (res) => {
        console.log('Сервер пнул сам себя');
    }).on('error', (e) => {
        // Ошибки нам не важны, просто игнорируем
    });
}, 600000); // 600 000 мс = 10 минут
