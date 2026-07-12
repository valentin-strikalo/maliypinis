require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, push, get } = require('firebase/database');
const path = require('path');
const fs = require('fs');

// 🔐 Telegram bot token from .env
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// 🔐 Firebase config from .env
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// ✅ Firebase init
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ✅ Telegram bot init
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userState = {};

const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '💰 Ввести баланс' }],
      [{ text: '➕ Добавить транзакцию' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

const skipKeyboard = {
  reply_markup: {
    keyboard: [[{ text: '⏭ Пропустить дату' }]],
    resize_keyboard: true,
    one_time_keyboard: true
  }
};

// Приветствие
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = null;
  bot.sendMessage(chatId, '👋 Привет! Выберите действие ниже:', mainMenu);
});

// Сообщения
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const state = userState[chatId];

  if (msg.text?.startsWith('/')) return;

  if (text === '💰 Ввести баланс') {
    userState[chatId] = 'waiting_balance';
    return bot.sendMessage(chatId, 'Введите ваш текущий баланс (только число):');
  }
  

  if (text === '➕ Добавить транзакцию') {
    userState[chatId] = {
      step: 1,
      type: '',
      name: '',
      img: '',
      amount: '',
      category: ''
    };
    return bot.sendMessage(chatId, '📂 Выберите тип транзакции:', {
      reply_markup: {
        keyboard: [
          [{ text: '➕ Доход' }, { text: '➖ Трата' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  if (state === 'waiting_balance') {
    const num = parseFloat(text);
    if (isNaN(num)) return bot.sendMessage(chatId, '❌ Введите корректное число.');

    set(ref(db, `balance/${chatId}`), { value: num.toFixed(2) })
      .then(() => {
        bot.sendMessage(chatId, `✅ Баланс ${num.toFixed(2)} ₴ сохранён.`, mainMenu);
        userState[chatId] = null;
      })
      .catch((err) => bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`));
    return;
  }

  // ➖ Трата или ➕ Доход
  if (typeof state === 'object' && state.step) {
    switch (state.step) {
      case 1:
  if (text === '➕ Доход') {
    state.type = 'income';
    state.step = 'select_income_source';
    return bot.sendMessage(chatId, '💳 Выберите источник дохода:', {
      reply_markup: {
        keyboard: [
          [{ text: 'City24' }],
          [{ text: 'Переказ Моно' }],
          [{ text: 'Переказ Приват' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  if (text === '➖ Трата') {
    state.type = 'expense';
    state.step = 'select_category';
    return bot.sendMessage(chatId, '📂 Выберите категорию:', {
      reply_markup: {
        keyboard: [
          [{ text: 'Продукти' }],
          [{ text: 'Переказ' }],
          [{ text: 'Кафе та ресторани' }],
          [{ text: 'Одяг' }],
          [{ text: 'Iнше' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  return bot.sendMessage(chatId, '❌ Выберите "➕ Доход" или "➖ Трата".');

      // Выбор категории
      case 'select_category':
  // Перевод категорий в нужный формат
  const categoryMap = {
    'Продукти': 'Food',
    'Переказ': 'Transfer',
    'Кафе та ресторани': 'Cafe',
    'Одяг': 'Clothes',
    'Iнше': 'Other'
  };

  const selectedCategory = categoryMap[text];
  if (!selectedCategory) return bot.sendMessage(chatId, '❌ Неизвестная категория.');

  state.category = selectedCategory;

  // 📤 Категория "Продукти"
  if (text === 'Продукти') {
    state.step = 'select_store';
    return bot.sendMessage(chatId, '🏪 Выберите магазин:', {
      reply_markup: {
        keyboard: [
          [{ text: 'АТБ' }, { text: 'Сільпо' }],
          [{ text: 'Нива' }, { text: 'Тайстра' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  // 💳 Категория "Переказ"
  if (text === 'Переказ') {
    state.step = 'enter_card';
    return bot.sendMessage(chatId, '💳 Введите номер карты (например: 414960****2519):');
  }

  // ☕ Категория "Кафе та ресторани"
  if (text === 'Кафе та ресторани') {
    state.step = 'select_cafe';
    return bot.sendMessage(chatId, '🏪 Выберите заведение:', {
      reply_markup: {
        keyboard: [
          [{ text: "McDonald's" }, { text: 'KFC' }],
          [{ text: 'Другое' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  // 👕 Для "Одяг" или "Інше" — сразу идём на ввод названия
  state.step = 2;
  return bot.sendMessage(chatId, '✍️ Введите название транзакции:');


      // Выбор магазина
      case 'select_store':
        const stores = {
          'АТБ': { name: 'АТБ', img: 'https://monotest-d5389.web.app/icons-bot/atb-logo.png' },
          'Сільпо': { name: 'Сільпо', img: 'https://monotest-d5389.web.app/icons-bot/silpo-logo.png' },
          'Нива': { name: 'Нива', img: 'https://monotest-d5389.web.app/icons-bot/niva-logo.png' },
          'Тайстра': { name: 'Тайстра', img: 'https://monotest-d5389.web.app/icons-bot/taistra-logo.png' }
        };

        const selected = stores[text];
        if (!selected) return bot.sendMessage(chatId, '❌ Выберите магазин из списка.');

        state.name = selected.name;
        state.img = selected.img;
        state.step = 4;
        return bot.sendMessage(chatId, '💰 Введите сумму:');

        // 💳 Ввод номера карты для "Переказ"
case 'enter_card':
  if (!/^\d{6}\*{4}\d{4}$/.test(text)) {
    return bot.sendMessage(chatId, '❌ Формат неверный. Используйте, например: 414960****2519');
  }

  state.name = text;
  state.img = 'https://monotest-d5389.web.app/icons-bot/transfer-logo.png';
  state.step = 4;
  return bot.sendMessage(chatId, '💰 Введите сумму:');

// ☕ Выбор заведения в "Кафе та ресторани"
case 'select_cafe':
  if (text === "McDonald's") {
    state.name = "McDonald's";
    state.img = 'https://monotest-d5389.web.app/icons-bot/mc-logo.png';
    state.step = 4;
    return bot.sendMessage(chatId, '💰 Введите сумму:');
  }

  if (text === 'KFC') {
    state.name = 'KFC';
    state.img = 'https://monotest-d5389.web.app/icons-bot/mc-logo.png'; // Пока та же картинка
    state.step = 4;
    return bot.sendMessage(chatId, '💰 Введите сумму:');
  }

  if (text === 'Другое') {
    state.img = 'https://monotest-d5389.web.app/icons-bot/cafe-logo.png';
    state.step = 'enter_cafe_name';
    return bot.sendMessage(chatId, '🏪 Введите название заведения:');
  }

  return bot.sendMessage(chatId, '❌ Пожалуйста, выберите заведение из списка.');

// ☕ Ввод названия кафе
case 'enter_cafe_name':
  state.name = text;
  state.step = 4;
  return bot.sendMessage(chatId, '💰 Введите сумму:');

  case 'select_income_source':
  if (text === 'City24') {
    state.name = 'City24';
    state.img = 'https://monotest-d5389.web.app/icons-bot/city24-logo.png';
    state.category = 'ADD';
    state.step = 4;
    return bot.sendMessage(chatId, '💰 Введите сумму:');
  }

  if (text === 'Переказ Моно' || text === 'Переказ Приват') {
    const monoImages = [
      'https://monotest-d5389.web.app/icons-bot/cat-ico.png',
    'https://monotest-d5389.web.app/icons-bot/cat-ico2.png',
    'https://monotest-d5389.web.app/icons-bot/cat-ico3.png'
    ];
    state.img = text === 'Переказ Моно'
    ? monoImages[Math.floor(Math.random() * monoImages.length)]
    : 'https://monotest-d5389.web.app/icons-bot/private24-logo.png';
    state.category = 'ADD_TRANSFER';
    state.step = 'enter_sender_name';
    state._from = text === 'Переказ Моно' ? 'Monobank' : 'PrivatBank';
    return bot.sendMessage(chatId, '👤 Введите имя отправителя в формате: Имя Фамилия');
  }

  return bot.sendMessage(chatId, '❌ Пожалуйста, выберите один из предложенных источников.');

case 'enter_sender_name':
  if (!/^([A-ZА-ЯІЇЄҐa-zа-яіїєґ]{2,})\s([A-ZА-ЯІЇЄҐa-zа-яіїєґ]{2,})$/.test(text)) {
    return bot.sendMessage(chatId, '❌ Пожалуйста, используйте формат: Имя Фамилия');
  }

  state.name = `Вiд: ${text}`;
  state.step = 4;
  return bot.sendMessage(chatId, '💰 Введите сумму:');


      case 2:
        state.name = text;
        state.step = 3;
        return bot.sendMessage(chatId, '📎 Введите ссылку на изображение или прикрепите фото:');

      case 3:
        if (msg.photo) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          return bot.getFileLink(fileId)
            .then((fileUrl) => {
              state.img = fileUrl;
              state.step = 4;
              bot.sendMessage(chatId, '💰 Введите сумму:');
            })
            .catch((err) => bot.sendMessage(chatId, `❌ Не удалось получить фото: ${err.message}`));
        } else if (text.startsWith('http')) {
          state.img = text;
          state.step = 4;
          return bot.sendMessage(chatId, '💰 Введите сумму:');
        } else {
          return bot.sendMessage(chatId, '📎 Пришлите ссылку или фото.');
        }

      case 4:
        const num = parseFloat(text);
        if (isNaN(num)) return bot.sendMessage(chatId, '❌ Введите число.');

        state.amount = state.type === 'expense' ? `-${num.toFixed(2)}` : num.toFixed(2);
        state.step = 5;

        return bot.sendMessage(chatId, '📅 Введите дату (например: 10 липня, 2025) или нажмите "Пропустить":', skipKeyboard);

      case 5:
  let parsedDate;
  if (text === '⏭ Пропустить дату') {
    parsedDate = new Date();
  } else {
    const ukrMonths = {
      січня: 0, лютого: 1, березня: 2, квітня: 3, травня: 4,
      червня: 5, липня: 6, серпня: 7, вересня: 8,
      жовтня: 9, листопада: 10, грудня: 11
    };

    const match = text.toLowerCase().match(/^(\d{1,2}) ([а-яіїєґ]+), (\d{4})$/);
    if (!match) return bot.sendMessage(chatId, '❌ Формат неверный. Пример: 10 липня, 2025');

    const [, d, m, y] = match;
    const monthIndex = ukrMonths[m];
    if (monthIndex === undefined) return bot.sendMessage(chatId, `❌ Неизвестный месяц: ${m}`);
    parsedDate = new Date(Date.UTC(+y, monthIndex, +d));
  }

  const amountNum = parseFloat(state.amount);

  const transaction = {
    id: Math.floor(1000 + Math.random() * 9000),
    name: state.name,
    img: state.img,
    amount: state.amount,
    date: parsedDate.toISOString(),
    type: state.type,
    category: state.category || ''
  };

  const balanceRef = ref(db, `balance/${chatId}`);

  // Получаем текущий баланс
  get(balanceRef).then(snapshot => {
    const current = snapshot.val();
    let newBalance = current?.value ? parseFloat(current.value) : 0;

    // Если это расход — уменьшаем
    if (state.type === 'expense') {
      newBalance -= Math.abs(amountNum);
    } else {
      newBalance += Math.abs(amountNum);
    }

    // Сохраняем транзакцию и обновляем баланс
    return Promise.all([
      push(ref(db, `transactions/${chatId}`), transaction),
      set(balanceRef, { value: newBalance.toFixed(2) })
    ]);
  }).then(() => {
    const formatted = parsedDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    const label = transaction.type === 'income' ? '📥 Доход' : '📤 Трата';

    bot.sendMessage(chatId,
      `✅ Транзакция добавлена:\n${label}\n${transaction.name} — ${transaction.amount} ₴\n📅 ${formatted}`,
      mainMenu
    );
    userState[chatId] = null;
  }).catch(err => {
    bot.sendMessage(chatId, `❌ Ошибка при сохранении или обновлении баланса: ${err.message}`);
  });

  return;
    }
  }
});
