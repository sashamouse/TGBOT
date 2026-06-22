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

// 1. Регистрация пользователя
app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!usersData[name]) {
        usersData[name] = { spins: 1 }; // Даем 1 попытку при первой регистрации
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

// 4. Админ: Начисление попыток через консоль (ТЫ ЭТО СЛУЧАЙНО УДАЛИЛ)
app.post('/api/add-spins', (req, res) => {
    const { name, amount, key } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).send("Ошибка: Неверный ключ");
    
    // Если пользователя нет, создаем его
    if (!usersData[name]) usersData[name] = { spins: 0 };
    
    usersData[name].spins += parseInt(amount);
    saveDb();
    res.json({ success: true, newTotal: usersData[name].spins });
});

// 5. Списание попытки после прокрута
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

// 6. Начисление попытки за выполнение задания (С ЗАЩИТОЙ)
app.post('/api/complete-task', (req, res) => {
    const { name } = req.body;
    
    if (!name) return res.status(400).send("Нет имени");

    // Если сервер перезагрузился и забыл пользователя, мы его тут же создаем
    if (!usersData[name]) {
        usersData[name] = { spins: 0 };
    }
    
    usersData[name].spins += 1;
    saveDb();
    res.json({ success: true, newTotal: usersData[name].spins });
});

// --- СТАРЫЙ ФУНКЦИОНАЛ ---

app.get('/config', (req, res) => {
    res.json(appConfig);
});

app.post('/update-config', (req, res) => {
    const { key, date, time } = req.body;
    if (key !== ADMIN_KEY) return res.status(403).send("Ошибка: Неверный ключ");
    
    // Если она меняет дату — прилетит только это уведомление
    if (date && date !== appConfig.meetingDate) {
        appConfig.meetingDate = date;
        bot.sendMessage(myChatId, `📅 Внимание! Она изменила ДАТУ встречи на: ${date}`);
    }

    // Если она меняет время — прилетит только это уведомление
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

const token = '8826215313:AAFs8n9UuyTEjoe3JIZe3J_KrO92jqa3BjE';
const myChatId = '743098995'; 
const bot = new TelegramBot(token, { polling: true });

function saveUserChatId(chatId) {
    const filePath = 'users.json';
    let users = [];
    if (fs.existsSync(filePath)) {
        try { users = JSON.parse(fs.readFileSync(filePath)); } catch (e) { users = []; }
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
            users.forEach(id => { bot.sendMessage(id, `🔔 Напоминание! Встреча через 8 часов: ${meetingDate}`); });
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

bot.onText(/\/test/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "✅ Тестовое уведомление работает! Если ты это видишь, значит всё настроено правильно.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

// --- АДМИН-КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ ИЗ ТЕЛЕГРАМА ---

// 1. Посмотреть список всех, кто подписался (нажал на кнопку)
bot.onText(/\/chats/, (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== myChatId) return; // Проверка, что пишет именно админ (ты)

    if (fs.existsSync('users.json')) {
        const users = JSON.parse(fs.readFileSync('users.json'));
        if (users.length === 0) {
            bot.sendMessage(myChatId, "👥 Список пользователей пуст.");
        } else {
            bot.sendMessage(myChatId, `👥 Список ID пользователей в базе:\n\n${users.join('\n')}\n\nЧтобы отправить сообщение конкретному человеку, скопируй его ID и напиши:\n/send [ID] [Текст]`);
        }
    } else {
        bot.sendMessage(myChatId, "Файл users.json еще не создан (никто не подписался).");
    }
});

// 2. Отправить любое сообщение ЛЮБОМУ пользователю по его ID
bot.onText(/\/send (\d+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== myChatId) return; // Только для тебя

    const targetChatId = match[1]; // ID того, кому шлем
    const textToSend = match[2];   // Текст сообщения

    bot.sendMessage(targetChatId, textToSend)
        .then(() => {
            bot.sendMessage(myChatId, `✅ Сообщение успешно отправлено на ID ${targetChatId}`);
        })
        .catch((err) => {
            bot.sendMessage(myChatId, `❌ Ошибка отправки: ${err.message}`);
        });
});

// 3. Отправить сообщение СРАЗУ ВСЕМ (если там будешь ты, она и кто-то еще)
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== myChatId) return; // Только для тебя

    const textToSend = match[1];

    if (fs.existsSync('users.json')) {
        const users = JSON.parse(fs.readFileSync('users.json'));
        users.forEach(id => {
            bot.sendMessage(id, textToSend)
                .catch((err) => console.log(`Ошибка отправки для ${id}:`, err.message));
        });
        bot.sendMessage(myChatId, `📢 Рассылка улетела всем пользователям!`);
    } else {
        bot.sendMessage(myChatId, "База пуста, слать некому.");
    }
});
