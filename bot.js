import TelegramBot from 'node-telegram-bot-api'
import 'dotenv/config'
import sequelize from './dbPostgres.js'

import { Op } from 'sequelize'
import fs from 'fs'
import { defFuncs } from './defFuncs.js'
import * as dbModels from './dbModels.js'
import { marzbanFuncs } from './marzbanFuncs.js'
import { text } from 'stream/consumers'

const HEAD_BOT_ADMIN_IDS = process.env.HEAD_BOT_ADMIN_IDS.split(",");
const BACK_BTN_TEXT = process.env.BACK_BTN_TEXT;
const CANCEL_BTN_TEXT = process.env.CANCEL_BTN_TEXT;
const MENU_BTN_TEXT = process.env.MENU_BTN_TEXT;
const TGBOT_TOKEN = process.env.TGBOT_TOKEN;
const SERVICE_NAME = process.env.SERVICE_NAME;
const DEF_ANSWERTEXT = process.env.DEF_ANSWERTEXT || 'Ошибка';
const PARTNER_PERCENT = process.env.PARTNER_PERCENT || 0;
const PARTNER_MIN_WITHDRAW = process.env.PARTNER_MIN_WITHDRAW || 1000;
const TRY_DAYS = Number(process.env.TRY_DAYS) || 1;

const withdraw_emjs = {
    'withdraw:req': '⏳',
    'withdraw:ok': '✅',
    'withdraw:cancel': '❌',
};

// const TARIFS = [
//     {
//         'months': 1,
//         'price': 10,
//     },
//     {
//         'months': 3,
//         'price': 11,
//     },
//     {
//         'months': 6,
//         'price': 12,
//     },
//     {
//         'months': 12,
//         'price': 13,
//     }
// ];

// const EVENT_TYPES = {
//     'reg': 'Новый пользователь',
//     'profit': 'Заработок +<b>{profit_sum}</b>💵 с реферала',
//     'req_withdraw': 'Запрос на вывод -<b>{withdraw_amount}</b>💵 на счет',
//     'withdraw': 'Вывод -<b>{withdraw_amount}</b>💵 на счет',
//     'withdraw_to_balance': 'Вывод -<b>{withdraw_amount}</b>💵 на основной баланс',
// };

const HEAD_MENU_BTNS = [
    [{callback_data: "/buy", text: "💳 Оплатить VPN"}],
    [{callback_data: "/settings", text: "⚙️ Установить и подключить"}],
    [{callback_data: "/refs", text: "👥 Пригласить друга (+5 дней)"}],
    [{callback_data: "/help", text: "🆘 Помощь"}],
];

const bot = new TelegramBot(TGBOT_TOKEN,
{
    polling: {
        interval: 100,
        autoStart: true
    }
});

const opts = [
    {command: 'start', description: '🏠 Главное меню'},
    {command: 'partner', description: '💼 Партнёрка'},
];
await bot.setMyCommands(opts);


const botMe = await bot.getMe();
// const BOT_USERNAME = botMe.username;
const TGBOT_LINK = "https://t.me/" + botMe.username;

async function botOn(event, eventType)
{
    try
    {
        const TARIFS = await defFuncs.getTarifs();
        var callAnswerText, command, messageData, callId;
        if(eventType == "message")
        {
            messageData = event;
            command = messageData.text;
        }
        else if(eventType == "callback")
        {
            callId = event.id;
            messageData = event.message;
            command = event.data;
        }
        
        const mId = messageData.message_id;
        const chatId = messageData.chat.id.toString();
        if(Number(chatId) < 0) return false;

        const options = {
            disable_web_page_preview: true,
            parse_mode: "HTML",
            message_id: mId
        };

        var answText = "";
        var newUserInput = "";
        var btns = [];
        var kbds = [];
        var newMsg = false;


        var tempBotUser = null;
        try
        {
            const msgUser = {
                chat_id: chatId,
                first_name: messageData.from.first_name,
                last_name: messageData.from.last_name,
                username: messageData.from.username,
                language_code: messageData.from.language_code,
            };
            tempBotUser = (await dbModels.BotUser.findOrCreate({
                where: {
                    chat_id: chatId
                },
                defaults: msgUser
            }))[0];
        }
        catch(error)
        {
            console.log(error);
            await bot.sendMessage(chatId, "Error #43");
        }
        if(tempBotUser === null) return false;
        const botUser = tempBotUser;

        const isAdmin = defFuncs.in_array(chatId, HEAD_BOT_ADMIN_IDS) ? true : false;

        // РАЗБИВКА РЕФЕРАЛЬНОЙ ССЫЛКИ
        const startRefMatch = command ? command.match(/\/start\s([a-zA-Z0-9]+)/) : null;
        if(startRefMatch) command = '/start';
        // РАЗБИВКА РЕФЕРАЛЬНОЙ ССЫЛКИ

        // ПРОВЕРЯЕМ НАЖАТА ЛИ КАКАЯ-ТО СПЕЦИАЛЬНАЯ INLINE КНОПКА
        const regExp = /^([^:]+):([^:]+):?([^:]*):?([^:]*):?([^:]*)/;
        const cmdMatches = command !== null && command !== undefined && command.match(regExp) ? command.match(regExp) : null;
        const callbackCommand = cmdMatches ? cmdMatches[1] : false;
        // ПРОВЕРЯЕМ НАЖАТА ЛИ КАКАЯ-ТО СПЕЦИАЛЬНАЯ INLINE КНОПКА

        const inputData = botUser.user_data !== null ? botUser.user_data : {};
        
        // ПРОВЕРЯЕМ ЖДЕТ ЛИ БОТ ОТ ЮСЕРА ВВОДА/ОТПРАВКИ ДАННЫХ
        var inputCommand = false;
        if(botUser.input !== null && eventType != "callback" && !command.match(/^\/[^\s\n\r\t]+/g))
        {
            inputCommand = botUser.input;
        }
        const inputMatches = inputCommand && inputCommand.match(regExp) ? inputCommand.match(regExp) : null;
        if(inputMatches) inputCommand = inputMatches[1];
        const inputValue = botUser.input !== null && eventType != "callback" ? command : '';

        const inCommand = callbackCommand ? callbackCommand : inputCommand ? inputCommand : command;
        const inMatches = cmdMatches ? cmdMatches : inputMatches ? inputMatches : null;
        // ПРОВЕРЯЕМ ЖДЕТ ЛИ БОТ ОТ ЮСЕРА ВВОДА/ОТПРАВКИ ДАННЫХ

        // Создаем ключ, если его нет, но оплата была
        botUser.exst_sub_link = botUser.sub_link && botUser.sub_link !== null && botUser.sub_link.length > 0 ? true : false;
        if(botUser.subToTime > defFuncs.timeFuncs.time() && !botUser.exst_sub_link)
        {
            try
            {
                var msgData = null;
                try
                {
                    msgData = await bot.sendMessage(chatId, "⏳ Загружаю ключ...");
                }
                catch(Err)
                {
                    console.log(Err);
                }
                const subUser = await marzbanFuncs.prolongSub(botUser, botUser.subToTime);
                if(subUser && subUser.subscription_url !== undefined)
                {
                    await dbModels.BotUser.update({tried: true, sub_link: subUser.subscription_url}, {where: {id: botUser.id}});
                    botUser.sub_link = subUser.subscription_url;
                    botUser.tried = true;
                    try
                    {
                        if(msgData) await bot.deleteMessage(chatId, msgData.message_id);
                    }
                    catch(Err)
                    {
                        console.log(Err);
                    }
                }
                else
                {
                    answText = "❗️ Не удалось создать ключ после успешной оплаты. Обратитесь в поддержку";
                    options.reply_markup = defFuncs.toBtns([[{callback_data: "/start", text: MENU_BTN_TEXT}]]);
                    await bot.sendMessage(answText, options);
                    return;
                }
            }
            catch(Err)
            {
                answText = "❗️ Не удалось создать ключ после успешной оплаты. Обратитесь в поддержку";
                options.reply_markup = defFuncs.toBtns([[{callback_data: "/start", text: MENU_BTN_TEXT}]]);
                await bot.sendMessage(answText, options);
                return;
            }
        }
        // Создаем ключ, если его нет, но оплата была

        botUser.balance = botUser.balance === null ? 0 : Number(botUser.balance);
        botUser.ref_balance = botUser.ref_balance === null ? 0 : Number(botUser.ref_balance);
        botUser.ref_balance_to_withdraw = botUser.ref_balance_to_withdraw === null ? 0 : Number(botUser.ref_balance_to_withdraw);
        botUser.profit_to_inviter = botUser.profit_to_inviter === null ? 0 : Number(botUser.profit_to_inviter);
        botUser.partner_balance = botUser.partner_balance === null ? 0 : Number(botUser.partner_balance);
        botUser.partner_balance_rezerv = botUser.partner_balance_rezerv === null ? 0 : Number(botUser.partner_balance_rezerv);
        botUser.sub_link = botUser.sub_link === null || botUser.sub_link.length == 0 ? '-' : botUser.sub_link;
        botUser.subToTimeDate = botUser.subToTime < defFuncs.timeFuncs.time() ? 'Нет подписки' : defFuncs.timeFuncs.dateFromTime(botUser.subToTime);
        botUser.partner_link = botUser.partner_link !== null ? TGBOT_LINK +'?start='+ botUser.partner_link : null;

        // РЕФЕРАЛКА
        if(startRefMatch !== null)
        {
            const refUniqId = startRefMatch[1];
            if(botUser.inviter_chat_id === null && refUniqId != botUser.chat_id && refUniqId != botUser.partner_link)
            {
                const inviterBotUser = await dbModels.BotUser.findOne({where: {[Op.or]: [{chat_id: refUniqId}, {partner_link: refUniqId}]}, logging: console.log});
                if(inviterBotUser !== null)
                {
                    try
                    {
                        const isFromPartner = refUniqId == inviterBotUser.partner_link ? true : false;
                        await dbModels.BotUser.update({inviter_chat_id: inviterBotUser.chat_id, from_partner: isFromPartner}, {where: {id: botUser.id}});
                        botUser.inviter_chat_id = inviterBotUser.chat_id;
                        await dbModels.RefsHistory.create({inviterTgId: inviterBotUser.chat_id, refTgId: botUser.chat_id, event_type: 'reg', from_partner: isFromPartner});
                        try
                        {
                            var newRefNotfText = '?';
                            if(isFromPartner)
                            {
                            //    newRefNotfText = 'По Вашей <b>партнерской</b> ссылке зарегистрировался новый пользователь <a href="tg://user?id='+ botUser.chat_id +'">'+ botUser.first_name +'</a>';
                            }
                            else
                            {
                                newRefNotfText = 'По Вашей <b>реферальной</b> ссылке зарегистрировался новый пользователь <a href="tg://user?id='+ botUser.chat_id +'">'+ botUser.first_name +'</a>';
                                await bot.sendMessage(inviterBotUser.chat_id, newRefNotfText, {parse_mode: "HTML"});
                            }
                        }
                        catch(Err)
                        {
                            console.log(Err);
                        }
                    }
                    catch(Err)
                    {
                        console.log(Err);
                    }
                }
            }
        }
        // РЕФЕРАЛКА

        // START BOT LOGIC
        if(inCommand == "/start")
        {
            answText = "Привет.";
            try
            {
                answText = (await fs.readFileSync('start_text.txt')).toString();
                answText = answText.replace(/{service_name}/, SERVICE_NAME);

                if(isAdmin) answText += "\n\n🔐 Вы вошли как <b>Админ</b>";
            }
            catch(Err)
            {
                answText = "Не удалось получить приветственное сообщние";
            }
            btns = getMenuBtns(botUser, isAdmin);
        }
        // else if(inCommand == '/docs')
        // {
        //     answText = "Выберите:";
        //     btns = [
        //         [{url: "https://t.me/telegram", text: "Ссылка 1"}],
        //         [{url: "https://t.me/telegram", text: "Ссылка 2"}],
        //         [{url: "https://t.me/telegram", text: "Ссылка 3"}],
        //         [{callback_data: "/start", text: BACK_BTN_TEXT}],
        //     ];
        // }
        else if(inCommand == '/buy')
        {
            answText = "Выберите тариф:";
            var btnLine = [];
            for(let tKey in TARIFS)
            {
                const tarif = TARIFS[tKey];
                btnLine.push({callback_data: "buy:" + tarif.months + ':yookassa', text: tarif.text_start + ' '+ tarif.months + " мес - "+ tarif.price +" ₽ " + tarif.text});
                if(btnLine.length == 1)
                {
                    btns.push(btnLine);
                    btnLine = [];
                }
            }
            if(btnLine.length > 0) btns.push(btnLine);
            btns.push([{callback_data: "/start", text: BACK_BTN_TEXT}]);
        }
        else if(inCommand == 'buy')
        {
            const buyMonths = Number(inMatches[2]);
            const buyEvent = inMatches[3];
            if(buyEvent == 'pay_type')
            {
                // answText = "Выберите способ оплаты:";
                // btns = [
                //     [{callback_data: "buy:"+ buyMonths +":yoomoney", text: "ЮMoney"}],
                //     [{callback_data: "/buy", text: BACK_BTN_TEXT}]
                // ];
            }
            else if(buyEvent == 'yookassa')
            {
                var tarif = false;
                for(let tKey in TARIFS)
                {
                    if(TARIFS[tKey].months === buyMonths)
                    {
                        tarif = TARIFS[tKey];
                        break;
                    }
                }
                if(tarif !== false)
                {
                    try
                    {
                        const payLabel = botUser.chat_id +":"+ tarif.months + ':' + Number(tarif.price);
                        // const payLink = await defFuncs.generateYoomoneyPayLink(tarif.price, payLabel);
                        const payLink = await defFuncs.getYooKassaPayLink(tarif.price, payLabel);
                        if(payLink === false) throw 'Ошибка при получении ссылки';
                        
                        answText = "1️⃣ Нажми на кнопку: «Оплатить», оплати "+ tarif.price +"₽ удобным для тебя способом 💳";
                        answText += "\n\n2️⃣ Возвращайся в бота за ⚡ скоростным VPN";
                        btns = [
                            [{url: payLink, text: "Оплатить "+ tarif.price +" ₽"}],
                            [
                                {callback_data: "/buy", text: BACK_BTN_TEXT},
                                {callback_data: "/start", text: MENU_BTN_TEXT}
                            ],
                        ];
                    }
                    catch(Err)
                    {
                        console.log(Err);
                        callAnswerText = "⚠️ Не удалось создать ссылку на оплату. Попробуйте позднее";
                    }
                }
                else callAnswerText = "⚠️ Не удалось найти тариф. Попробуйте позднее";
            }
        }
        else if(inCommand == '/doc')
        {
            btns = [
                [{callback_data: "/about:del_msg", text: BACK_BTN_TEXT}],
            ];
            options.reply_markup = defFuncs.toBtns(btns)
            await bot.sendDocument(chatId, 'files/Document.txt', options);
        }
        else if(inCommand == '/help')
        {
            answText = "Помощь";
            btns = [
                // [{callback_data: "/write_support", text: "💬 Написать в поддержку"}],
                [{url: "https://t.me/telegram", text: "💬 Написать в поддержку"}],
                [{callback_data: "/faq", text: "❓ Частые вопросы"}],
                [{callback_data: "/start", text: BACK_BTN_TEXT}],
            ];
        }
        else if(inCommand == '/faq')
        {
            answText = "Частые вопросы и ответы на них:";
            btns = [
                [{callback_data: "/help", text: BACK_BTN_TEXT}],
            ];
        }
        else if(inCommand == '/partner' || inCommand == 'profit')
        {
            const profitEvents = inMatches ? inMatches[2] : null;
            if(inCommand == '/partner' && botUser.partner_link === null)
            {
                answText = "Привет, если у тебя есть возможность привлекать клиентов, я могу предложить тебе возможность заработать:";
                answText += "\n\nНажми на кнопку <b>«🔗 Создать партнерскую ссылку»</b> и бот создаст для тебя ссылку для заработка!";
                answText += "\n\nЯ буду выплачивать тебе <b>"+ PARTNER_PERCENT +"% за продажу и продления</b> ключей с выводом от <b>"+ PARTNER_MIN_WITHDRAW +"₽</b>!";
                btns = [
                    [{callback_data: "profit:create_link", text: "🔗 Создать партнерскую ссылку"}],
                    [{callback_data: "/start", text: BACK_BTN_TEXT}],
                ];
            }
            else if(profitEvents == 'create_link' || inCommand == '/partner')
            {
                try
                {
                    if(profitEvents == 'create_link' || botUser.partner_link === null)
                    {
                        const newParterUniq = 'p' + defFuncs.randomString(12);
                        await dbModels.BotUser.update({partner_link: newParterUniq}, {where: {id: botUser.id}});
                        botUser.partner_link = TGBOT_LINK +'?start='+ newParterUniq;
                    }
                    const invitedFromPartners = await dbModels.BotUser.findAll({where: {inviter_chat_id: botUser.chat_id, from_partner: true}});
                    
                    const partnerHistoryArr = await dbModels.PartnersHistory.findAll({where: {inviterTgId: botUser.chat_id}});
                    const profitData = {
                        invited_count: invitedFromPartners.length,
                        buyed_amount: 0,
                        prolon_amount: 0,
                        profit_amount: 0,
                        withdrawed_amount: 0,
                        withdraw_req_amount: 0,
                    };
                    for(let pKey in partnerHistoryArr)
                    {
                        const partnerHistory = partnerHistoryArr[pKey];
                        
                        if(partnerHistory.event_type == 'profit:buy') profitData.buyed_amount += Number(partnerHistory.realAmount);
                        if(partnerHistory.event_type == 'profit:prolong') profitData.prolon_amount += Number(partnerHistory.realAmount);
                        if(partnerHistory.event_type.match(/^profit/)) profitData.profit_amount += Number(partnerHistory.receivedAmount);
                        if(partnerHistory.event_type == 'withdraw:req') profitData.withdraw_req_amount += Number(partnerHistory.withdraw_amount);
                        if(partnerHistory.event_type == 'withdraw:ok') profitData.withdrawed_amount += Number(partnerHistory.withdraw_amount);
                    }

                    answText = botUser.partner_link;
                    answText += "\n\nЗаработок партнера: <b>"+ PARTNER_PERCENT +"%</b>";
                    answText += "\nКлиентов перешло: <b>"+ profitData.invited_count +"</b>";
                    answText += "\n\nПриобретено ключей на: <b>"+ profitData.buyed_amount +"₽</b>";
                    answText += "\nПродлений на: <b>"+ profitData.prolon_amount +"₽</b>";
                    answText += "\nЗаработок партнера (всего): <b>"+ profitData.profit_amount +"₽</b>";
                    answText += "\nВыведено: <b>"+ profitData.withdrawed_amount +"₽</b>";
                    answText += "\nОжидают вывод: <b>"+ profitData.withdraw_req_amount +"₽</b>";
                    answText += "\nОсталось на вывод: <b>"+ botUser.partner_balance +"₽</b>";
                    answText += "\n\nℹ️ Запрос на вывод средств возможен от <b>"+ PARTNER_MIN_WITHDRAW +"₽</b>";
                    btns = [
                        [{callback_data: "profit:withdraws:list", text: "💰 Запросы на вывод"}],
                        [{callback_data: "/start", text: BACK_BTN_TEXT}]
                    ];
                }
                catch(Err)
                {
                    callAnswerText = "⚠️ Не удалось создать ссылку. Попробуйте позднее";
                    console.log(Err);
                }
            }
            else if(profitEvents == 'withdraws')
            {
                const profitWithdrawEvent = inMatches[3];
                if(profitWithdrawEvent == 'list')
                {
                    const parthersWithdraws = await dbModels.PartnersHistory.findAll({where: {inviterTgId: botUser.chat_id, event_type: {[Op.startsWith]: 'withdraw'}}, order: [['id', 'DESC']]});
                    if(parthersWithdraws.length > 0)
                    {
                        answText = "Запросы на вывод:";
                        answText += "\n⏳ - Ожидание ответа";
                        answText += "\n✅ - Вывод успешно заверешен";
                        for(let wKey in parthersWithdraws)
                        {
                            const parthersWithdraw = parthersWithdraws[wKey];
                            parthersWithdraw.withdraw_requisites = parthersWithdraw.withdraw_requisites === null ? '-' : parthersWithdraw.withdraw_requisites;
                            const emj = withdraw_emjs[parthersWithdraw.event_type];
                            answText += "\n\n"+ emj +" <b>№"+ parthersWithdraw.id +"</b> | <b>"+ defFuncs.timeFuncs.dateFromTimestamp(parthersWithdraw.createdAt) +"</b>";
                            answText += "\n<b>💵 "+ parthersWithdraw.withdraw_amount +" ₽</b>";
                            answText += "\n<b>💳 "+ parthersWithdraw.withdraw_requisites +"</b>";
                        }
                    }
                    else answText = "⚠️ Запросов на вывод не было найдено!";

                    answText += "\n\nℹ️ Для создания запроса на вывод, нажмите на кнопку <b>🆕 Добавить запрос на вывод</b> ниже 👇";
                    btns = [
                        [{callback_data: "profit:withdraws:new", text: "🆕 Добавить запрос на вывод"}],
                        [{callback_data: "/partner", text: BACK_BTN_TEXT}],
                    ];
                }
                else if(profitWithdrawEvent == 'new')
                {
                    if(botUser.partner_balance >= PARTNER_MIN_WITHDRAW)
                    {
                        newUserInput = "profit:withdraws:get_requisites";
                        answText = "Введите <b>реквизиты</b> для вывода:";
                        btns = [[{callback_data: "profit:withdraws:list", text: BACK_BTN_TEXT}]];
                    }
                    else
                    {
                        answText = "🛑 У вас нет достаточной суммы для вывода!";
                        answText += "\n\nℹ️ Запрос на вывод средств возможен от <b>"+ PARTNER_MIN_WITHDRAW +"₽</b>";
                        answText += "\n⚠️ На данный момент зарезервировано <b>"+ botUser.partner_balance_rezerv +"₽</b>";
                        answText += "\nℹ️ Возможно для вывода: <b>"+ botUser.partner_balance +"</b>₽";

                        btns = [[{callback_data: "profit:withdraws:list", text: BACK_BTN_TEXT}]];
                    }
                }
                else if(profitWithdrawEvent == 'get_requisites')
                {
                    inputData.withdraw_requisites = inputValue;
                    newUserInput = "profit:withdraws:get_amount";
                    answText = "Введите <b>сумму</b> для вывода:";
                    btns = [[{callback_data: "profit:withdraws:list", text: BACK_BTN_TEXT}]];
                }
                else if(profitWithdrawEvent == 'get_amount')
                {
                    const profitWithdrawAmount = Number(inputValue);
                    if(profitWithdrawAmount >= PARTNER_MIN_WITHDRAW)
                    {
                        if(botUser.partner_balance >= profitWithdrawAmount)
                        {
                            inputData.profitWithdrawAmount = profitWithdrawAmount;
                            answText = "🟠 Подтвердите запрос на вывод:";
                            answText += "\n💵 Сумма: <b>"+ profitWithdrawAmount +"₽</b>";
                            answText += "\n💳 Реквизиты: <b>"+ inputData.withdraw_requisites +"</b>";
                            btns = [
                                [{callback_data: "profit:withdraws:send", text: "✅ Отправить запрос на вывод"}],
                                [{callback_data: "profit:withdraws:new", text: BACK_BTN_TEXT}]
                            ];
                        }
                        else
                        {
                            newUserInput = botUser.input;
                            answText = "🛑 У вас нет достаточной суммы для вывода!";
                            answText += "\nℹ️ Введите сумму до <b>"+ botUser.partner_balance +"₽</b>";
                            btns = [[{callback_data: "profit:withdraws:list", text: BACK_BTN_TEXT}]];
                        }
                    }
                    else
                    {
                        newUserInput = botUser.input;
                        answText = "ℹ️ Минимальная сумма вывода <b>"+ PARTNER_MIN_WITHDRAW +"₽</b>";
                        answText += "\n\nВведите сумму больше <b>"+ PARTNER_MIN_WITHDRAW +"₽</b>:";
                        btns = [[{callback_data: "profit:withdraws:list", text: BACK_BTN_TEXT}]];
                    }
                }
                else if(profitWithdrawEvent == 'send')
                {
                    const newPartnerBalance = Number((botUser.partner_balance - Number(inputData.profitWithdrawAmount)).toFixed(2));
                    if(botUser.partner_balance >= inputData.profitWithdrawAmount && newPartnerBalance >= 0)
                    {
                        const transaction = await sequelize.transaction();
                        try
                        {
                            const newPartnerBalanceRezerv = Number((botUser.partner_balance_rezerv + Number(inputData.profitWithdrawAmount)).toFixed(2));
                            await dbModels.BotUser.update({partner_balance: newPartnerBalance.toFixed(2), partner_balance_rezerv: newPartnerBalanceRezerv}, {where: {id: botUser.id}}, {transaction});
                            const newWithdraw = await dbModels.PartnersHistory.create({
                                inviterTgId: botUser.chat_id,
                                withdraw_amount: inputData.profitWithdrawAmount.toString(),
                                withdraw_requisites: inputData.withdraw_requisites,
                                event_type: 'withdraw:req',
                                description: 'Request for withdraw '+ inputData.profitWithdrawAmount +' RUB',
                            }, {transaction});

                            answText = "✅ Запрос на вывод "+ inputData.profitWithdrawAmount +"₽ успешно отправлен";
                            callAnswerText = answText;
                            btns = [
                                [{callback_data: '/start', text: MENU_BTN_TEXT}]
                            ];

                            const admText = "🆕 Новый запрос на вывод средств";
                            const admBtns = [
                                [{callback_data: 'admin:withdraw:show:' + newWithdraw.id, text: "Перейти к запросу ➡️"}],
                                [{callback_data: 'admin:withdraw:list', text: "👁 Посмотреть весь список"}],
                                [{callback_data: '/start', text: MENU_BTN_TEXT}]
                            ];
                            const admOptions = options;
                            admOptions.reply_markup = defFuncs.toBtns(admBtns);
                            await sendMsgToAdmins(admText, admOptions);

                            await transaction.commit();
                        }
                        catch(Err)
                        {
                            await transaction.rollback();
                            console.log(Err);
                            callAnswerText = "Ошибка. Попробуйте позднее";
                        }
                    }
                    else callAnswerText = "❗️ Не достаточно средств!";
                }
            }
        }
        // else if(inCommand == '/write_support')
        // {
        //     newUserInput = 'get_support_text';
        //     answText = "Введите текст:";
        //     btns = [
        //         [{callback_data: "/help", text: BACK_BTN_TEXT}],
        //     ];
        // }
        // else if(inCommand == 'get_support_text')
        // {
        //     newUserInput = 'get_support_text';
        //     try
        //     {
        //         answText = "✅ Сообщение успешно отправлено в поддержку. Ожидайте ответа...";
        //         await dbModels.SupportMsgs.create({
        //             userTgId: chatId,
        //             text: inputValue,
        //             mId: mId,
        //             msg_data: event
        //         });
        //         btns = [
        //             [{callback_data: "/start", text: MENU_BTN_TEXT}],
        //         ];
        //     }
        //     catch(Err)
        //     {
        //         console.log(Err);
        //         answText = "Не удалось отправить сообщение. Попробуйте позднее";
        //     }
        // }
        else if(inCommand == '/try')
        {
            if(!botUser.tried)
            {
                options.chat_id = chatId;
                await bot.editMessageText('⏳ Создаю ключ...', options);
                const subUser = await marzbanFuncs.getSubUser(botUser, TRY_DAYS);
                // console.log('subUser:', subUser);
                if(subUser && subUser.subscription_url !== undefined)
                {
                    await dbModels.BotUser.update({tried: true, subToTime: subUser.expire, sub_link: subUser.subscription_url}, {where: {id: botUser.id}});
                    botUser.tried = true;
                    botUser.sub_link = subUser.subscription_url;
                    answText = "🔑 Ваш <b>VLESS</b> ключ:<pre>" + subUser.subscription_url +"</pre>";
                    answText += "\n\n📅 Доступ до: <b>" + defFuncs.timeFuncs.dateFromTime(subUser.expire) + '</b>';
                    btns = getMenuBtns(botUser, isAdmin);
                }
                else
                {
                    options.reply_markup = defFuncs.toBtns(getMenuBtns(botUser, isAdmin));
                    options.entities = event.message.entities;
                    await bot.editMessageText(event.message.text, options);
                    callAnswerText = "Не удалось создать ключ. Попробуйте позднее";
                }
            }
            else callAnswerText = "Вы уже использовали пробную подписку!";
        }
        // else if(inCommand == '/profile')
        // {
        //     answText = "👤 Профиль";
        //     answText += "\n\n💵 Баланс: " + botUser.balance;
        //     answText += "\n🔗 Реферальный баланс: " + botUser.ref_balance;
        //     answText += "\n🔑 Подписка до: " + botUser.subToTimeDate;
        //     answText += "\n\n🔗 Реферальная ссылка:\n"+ TGBOT_LINK +"?start="+ botUser.chat_id;
        //     answText += "\n\n🔑 Ваш ключ: <pre>"+ botUser.sub_link +'</pre>';

        //     btns = [
        //         [{callback_data: "/buy", text: "🔑 Приобрести подписку"}],
        //         [{callback_data: "/topup", text: "💵 Пополнить баланс"}],
        //         [{callback_data: "/ref_profile", text: "🔗 Реферальный профиль"}],
        //         [{callback_data: "/start", text: BACK_BTN_TEXT}]
        //     ];
        // }
        else if(inCommand == '/refs')
        {
            const refLink = TGBOT_LINK +"?start="+ botUser.chat_id;
            answText = "За каждого приглашенного друга, ты получишь 🗓️ 5 дней VPN 🌐 в подарок 🎁";
            answText += "\n\n<pre>"+ refLink +"</pre>"
            const shareUrlText = "https://telegram.me/share/url?url=Быстрый и стабильный ВПН, попробуй: " + refLink;
            btns = [
                [{url: shareUrlText, text: "📢 Поделиться"}],
                [{callback_data: "/start", text: BACK_BTN_TEXT}]
            ];
        }
        // else if(inCommand == '/ref_profile' || inCommand == 'ref_profile:accept_to_balance')
        // {
        //     if(inCommand == 'ref_profile:accept_to_balance')
        //     {
        //         try
        //         {
        //             const newBalance = Math.round((botUser.balance + botUser.ref_balance));
        //             await dbModels.BotUser.update({balance: newBalance.toString(), ref_balance: null}, {where: {id: botUser.id}});
        //             await dbModels.RefsHistory.create({
        //                 inviterTgId: botUser.chat_id,
        //                 refTgId: botUser.chat_id,
        //                 realAmount: botUser.ref_balance,
        //                 withdraw_amount: botUser.ref_balance,
        //                 event_type: 'withdraw_to_balance',
        //             });
        //             botUser.balance = newBalance;
        //             botUser.ref_balance = 0;
        //             callAnswerText = "✅ Средства успешно выведены";
        //         }
        //         catch(Err)
        //         {
        //             console.log(Err);
        //             callAnswerText = "⚠️ Ошибка при выводе средств. Попробуйте позднее";
        //         }
        //     }
        //     answText = "💵 Реферальный баланс: " + botUser.ref_balance;
        //     answText += "\n\n🔗 Реферальная ссылка:\n"+ TGBOT_LINK +"?start="+ botUser.chat_id;
        //     btns = [
        //         [{callback_data: "ref_profile:withdraw", text: "💳 Вывод средств"}],
        //         [{callback_data: "ref_profile:withdraw_to_balance", text: "💰 Перевод на баланс"}],
        //         [{callback_data: "ref_profile:refs", text: "👥 Мои рефералы"}],
        //         [{callback_data: "ref_profile:history", text: "📋 История транзакций"}],
        //         [{callback_data: "/profile", text: BACK_BTN_TEXT}]
        //     ];
        // }
        // else if(inCommand == 'ref_profile')
        // {
        //     const refEvent = inMatches[2];
        //     if(refEvent == 'withdraw')
        //     {
        //         newUserInput = 'ref_profile:get_withdraw_amount';
        //         answText = "Введите <b>сумму</b> вывода:";
        //         btns = [[{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]];
        //     }
        //     else if(refEvent == 'get_withdraw_amount')
        //     {
        //         const withdrawAmount = Number(inputValue);
        //         if(botUser.ref_balance >= withdrawAmount)
        //         {
        //             if(withdrawAmount > 100 && withdrawAmount <= 15000)
        //             {
        //                 inputData.withdraw_amount = withdrawAmount;
        //                 newUserInput = 'ref_profile:get_withdraw_requisites';
        //                 answText = "Введите реквизиты для вывода:";
        //                 btns = [[{callback_data: "ref_profile:withdraw", text: BACK_BTN_TEXT}]];
        //             }
        //             else 
        //             {
        //                 newUserInput = botUser.input;
        //                 answText = "⚠️ Сумма вывода должна быть в диапазоне от <b>100</b> до <b>15 000</b>\n\nПопробуйте ввести еще раз:";
        //                 btns = [[{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]];
        //             }
        //         }
        //         else 
        //         {
        //             newUserInput = botUser.input;
        //             answText = "⚠️ Недостаточно средств для вывода\n\nПопробуйте ввести другую сумму:";
        //             btns = [[{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]];
        //         }
        //     }
        //     else if(refEvent == 'get_withdraw_requisites')
        //     {
        //         inputData.withdraw_requisites = inputValue;
        //         const transaction = await sequelize.transaction();
        //         try
        //         {
        //             const withdrawAmount = inputData.withdraw_amount;
        //             if(botUser.ref_balance >= withdrawAmount)
        //             {
        //                 if(withdrawAmount > 100 && withdrawAmount <= 15000)
        //                 {
        //                     await dbModels.RefsHistory.create({
        //                         inviterTgId: botUser.chat_id,
        //                         refTgId: botUser.chat_id,
        //                         withdraw_amount: withdrawAmount.toString(),
        //                         event_type: 'req_withdraw',
        //                     }, {transaction});

        //                     const newRefBalance = botUser.ref_balance - withdrawAmount;
        //                     const newRefBalanceToWithdraw = botUser.ref_balance_to_withdraw + withdrawAmount;
        //                     await dbModels.BotUser.update({ref_balance: newRefBalance, ref_balance_to_withdraw: newRefBalanceToWithdraw}, {where: {id: botUser.id}}, {transaction});
                            
        //                     answText = "✅ Запрос на вывод средств успешно отправлен. Ожидайте ответа";
        //                     btns = [[{callback_data: "/start", text: MENU_BTN_TEXT}]];

        //                     await transaction.commit();
        //                 }
        //                 else 
        //                 {
        //                     newUserInput = botUser.input;
        //                     answText = "⚠️ Сумма вывода должна быть в диапазоне от <b>100</b> до <b>15 000</b>\n\nПопробуйте ввести еще раз:";
        //                     btns = [[{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]];
        //                 }
        //             }
        //             else 
        //             {
        //                 newUserInput = botUser.input;
        //                 answText = "⚠️ Недостаточно средств для вывода\n\nПопробуйте ввести другую сумму:";
        //                 btns = [[{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]];
        //             }
        //         }
        //         catch(Err)
        //         {
        //             await transaction.rollback();
        //             answText = "❗️Ошибка при создании заявки на вывод. Попробуйте позднее или обратитесь в поддержку, если ошибка повторяется много раз";
        //             btns = [
        //                 [{callback_data: "/write_support", text: "💬 Написать в поддержку"}]
        //                 [{callback_data: "/start", text: MENU_BTN_TEXT}]
        //             ];
        //         }
        //     }
        //     else if(refEvent == 'withdraw_to_balance')
        //     {
        //         answText = "Перевести <b>ВСЁ</b> на баланс?";
        //         btns = [
        //             [{callback_data: "ref_profile:accept_to_balance", text: "✅ Да, перевести"}],
        //             [{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]
        //         ];
        //     }
        //     else if(refEvent == 'refs')
        //     {
        //         const myRefs = await dbModels.BotUser.findAll({where: {inviter_chat_id: botUser.chat_id}});
        //         answText = "👥 Мои рефералы - Всего: " + myRefs.length;
        //         if(myRefs.length > 0)
        //         {
        //             answText += "\n\n<b>Рефреал</b> - <b>Заработок</b>";
        //             for(let rKey in myRefs)
        //             {
        //                 const myRef = myRefs[rKey];
        //                 const fullRefName = myRef.last_name === null ? myRef.first_name : myRef.first_name + ' ' + myRef.last_name;
        //                 answText += "\n<a href=\"tg://user?id="+ myRef.chat_id+"\">" + fullRefName + '</a> - 💵'+ myRef.profit_to_inviter;
        //             }
        //         }
        //         else answText += "\n\nПока пусто";
        //     }
        //     else if(refEvent == 'history')
        //     {
        //         answText = "Реферальная история\n"; // История всех выводов, переводов, начислений средств на реф. Баланс.
        //         const refsHistory = await dbModels.RefsHistory.findAll({where: {inviterTgId: botUser.chat_id}, order: [['id', 'DESC']]});
        //         if(refsHistory.length > 0)
        //         {
        //             const allUsers = await dbModels.BotUser.findAll({where: {inviter_chat_id: botUser.chat_id}});
        //             const allUsersObj = {};
        //             for(let uKey in allUsers)
        //             {
        //                 const user = allUsers[uKey];
        //                 user.last_name = user.last_name === null ? '' : user.last_name;
        //                 allUsersObj[user.chat_id] = user;
        //             }
        //             for(let rKey in refsHistory)
        //             {
        //                 const refHistory = refsHistory[rKey];
        //                 const refUser = allUsersObj[refHistory.refTgId];
        //                 var eventEmj = '🟢';
        //                 if(refHistory.event_type.match(/req_/)) eventEmj = '🟡';
        //                 else if(refHistory.event_type.match(/withdraw/)) eventEmj = '🔴';
        //                 else if(refHistory.event_type == 'reg') eventEmj = '👤';

        //                 answText += "\n"+ eventEmj +" <b>" + defFuncs.timeFuncs.dateFromTimestamp(refHistory.createdAt) +'</b>';
        //                 var eventTypeString = EVENT_TYPES[refHistory.event_type].replace(/{profit_sum}/, '<b>'+refHistory.receivedAmount+'</b>');
        //                 eventTypeString = eventTypeString.replace(/{withdraw_amount}/, refHistory.withdraw_amount);
        //                 answText += "\n" + eventTypeString;
        //                 if(defFuncs.in_array(refHistory.event_type, ['reg', 'profit']))
        //                 {
        //                     answText += ' <a hreg="tg://user?id='+ refUser.chat_id +'">'+ refUser.first_name +' '+ refUser.last_name +'</a>'
        //                 }
        //                 answText += "\n";
        //             }
        //         }
        //         else answText += "\n\nПока пусто";
        //     }
        //     if(btns.length === 0) btns.push([{callback_data: "/ref_profile", text: BACK_BTN_TEXT}]);
        // }
        else if(inCommand == '/settings')
        {
            if(botUser.exst_sub_link)
            {
                answText = "📅 <b>Подписка до:</b> " + botUser.subToTimeDate;
                answText += "\n\nВаш <b>VLESS</b> ключ:<pre>"+ botUser.sub_link +"</pre>";
                answText += "\n\nВыберите свое устройство ниже👇 для получения инструкции";

                btns = [
                    [{callback_data: "sets:android", text: "📱 Android"}],
                    [{callback_data: "sets:apple", text: "📱 iPhone"}],
                    [{callback_data: "sets:windows", text: "🖥 Windows"}],
                    [{callback_data: "sets:apple", text: "💻 macOS"}],
                    [{callback_data: "sets:androidtv", text: "📺 Android TV"}],
                    [{callback_data: "/start", text: BACK_BTN_TEXT}],
                ];
            }
            else callAnswerText = "⚠️ На данный момент у Вас нет подписки";
        }
        else if(inCommand == 'sets')
        {
            const setsEvent = inMatches[2];
            if(setsEvent == 'android' || setsEvent == 'apple')
            {
                answText = "1️⃣ Скачайте и установите приложение <b>v2RayTun</b> нажав на первую кнопку ниже «🌐 Скачать приложение»";
                answText += "\n\n2️⃣ Вставьте свою подписку в приложение нажав на вторую кнопку ниже «🔑 Добавить подписку»";
                var appUrl = 'https://play.google.com/store/apps/details?id=com.v2raytun.android&hl=ru';
                if(setsEvent == 'apple') appUrl = 'https://apps.apple.com/ru/app/v2raytun/id6476628951?l=en-GB';
                btns = [
                    [{url: appUrl, text: "🌐 Скачать приложение"}],
                    [{url: "https://deeplink.website/?url=" + botUser.sub_link, text: "🔑 Добавить подписку"}],
                ];
            }
            else if(setsEvent == 'windows')
            {
                answText = "1️⃣ Скачайте и установите приложение v2raytun на Windows по ссылке ниже";
                answText += "\n\nhttps://storage.fcknrockn.net/v2RayTun_Setup.exe";
                answText += "\n\n2️⃣ Скопируйте ссылку на свою подписку ниже на Windows";
                answText += "\n<pre>"+ botUser.sub_link +"</pre>";
                answText += "\n\n3️⃣ В правом верхнем углу приложения <b>v2RayTun</b> нажмите на ➕ и выберите «Импорт из буфера обмена»";
                answText += "\n\n⚡️ Готово, ваша подписка добавлена, нажимаете на синюю круглую кнопку и подключайтесь к VPN.";
            }
            else if(setsEvent == 'androidtv')
            {
                answText = "1️⃣ Установите на смартфон приложение-пульт для управления телевизором (доступно для iOS и Android) и подключите его к телевизору.";
                answText += "\n\n2️⃣ Установите приложение v2RayTun на телевизоре, скачать его можно в официальном Google Play на вашем телевизоре";
                answText += "\n\n3️⃣ Запустите приложение и перейдите а раздел - «Управление»";
                answText += "\n\n4️⃣ В открывшемся окне выберете пункт - «Ручной ввод» , скопируйте ссылку на вашу подписку ниже 👇 и вставьте скопированную ссылку из Telegram с помощью приложения-пульта на телефоне. Нажмите «OK» для завершения настройки и включите VPN.";
                answText += "\n\n<pre>"+ botUser.sub_link +"</pre>";
            }
            btns.push([{callback_data: "/settings", text: BACK_BTN_TEXT}]);
        }
            // else if(setsEvent == 'edit_mask' || setsEvent == 'set_mask')
        //     {
        //         try
        //         {
        //             if(setsEvent == 'set_mask')
        //             {
        //                 var newMask = inMatches[3];
        //                 if(newMask == 'del') newMask = null;
        //                 await dbModels.BotUser.update({sni: newMask}, {where: {id: botUser.id}});
        //                 botUser.sni = newMask;
        //             }
        //             botUser.sni_orig = botUser.sni;
        //             if(botUser.sni === null) botUser.sni = 'Без маскировки';
                    
        //             answText = "🙈 <b>Текущий сайт маскировки: "+ botUser.sni +"</b>";
        //             answText += "\n\nЭта функция нужна для маскировки трафика. Провайдер видит, что ты заходишь, например, на mail.com, хотя на самом деле подключен к VPN.";
        //             if(botUser.sni_orig !== null) answText += "\n\n🎭 <b>Если "+ botUser.sni +"  работает нестабильно, просто смени сайт маскировки</b>";
                    
        //             const masksArr = ((await fs.readFileSync('masks.txt')).toString()).split("\n");
        //             btns = [];
        //             btns.push([{callback_data: 'sets:set_mask:del', text: 'Без маскировки'}]);
        //             var btnLine = [];
        //             for(let mKey in masksArr)
        //             {
        //                 const mask = masksArr[mKey];
        //                 btnLine.push({callback_data: 'sets:set_mask:' + mask, text: mask});
        //                 if(btnLine.length == 2)
        //                 {
        //                     btnLine = [];
        //                     btns.push(btnLine);
        //                 }
        //             }
        //             if(btnLine.length > 0)
        //             {
        //                 btnLine = [];
        //                 btns.push(btnLine);
        //             }
        //             const botUserSni = botUser.sni_orig !== null ? botUser.sni_orig : 'del';
        //             for(let bKey in btns)
        //             {
        //                 const btnLine = btns[bKey];
        //                 for(let blKey in btnLine)
        //                 {
        //                     const btn = btnLine[blKey];
        //                     if(btn.callback_data.includes(':' + botUserSni)) btns[bKey][blKey].text = "✅ " + btns[bKey][blKey].text;
        //                 }
        //             }
        //         }
        //         catch(Err)
        //         {
        //             callAnswerText = "⚠️ Ошибка. Попробуйте позднее";
        //         }
        //     }
        //     else if(setsEvent == 'renew_keys')
        //     {
        //         const renewKeysEvent = inMatches[3];
        //         if(!renewKeysEvent)
        //         {
        //             answText = "Если твой ключ был передан слишком многим пользователям, ты можешь создать новый.";
        //             answText += "\n\n⚠️ <b>Важно</b>: старые ключи перестанут работать!";
        //             btns = [[{callback_data: "sets:renew_keys:accept", text: "🔑 Сгенерировать новый ключ"}]];
        //         }
        //         else if(renewKeysEvent == 'accept')
        //         {
        //             if(botUser.subToTime > defFuncs.timeFuncs.time())
        //             {
        //                 answText = "⏳ Генерирую новый ключ. Ожидайте...";
        //                 const tempBtns = [[{callback_data: "/settings", text: BACK_BTN_TEXT}]]
        //                 options.reply_markup = defFuncs.toBtns(tempBtns);
        //                 options.chat_id = chatId;
        //                 await bot.editMessageText(answText, options);
        //                 // await defFuncs.delay(1500);

        //                 try
        //                 {
        //                     const subUser = await marzbanFuncs.remokeSubUser(botUser);
        //                     await dbModels.BotUser.update({sub_link: subUser.subscription_url}, {where: {id: botUser.id}});
        //                     botUser.sub_link = subUser.subscription_url;
        //                     answText = "✅ Новый ключ успешно сгенерирован:";
        //                     answText += "<pre>"+ botUser.sub_link +"</pre>";
        //                 }
        //                 catch(Err)
        //                 {
        //                     callAnswerText = "⚠️ Не удалось перевыпустить ключ. Попробуйте позднее";
        //                     console.log('Ошибка при перепуске ключа');
        //                     console.log(Err);
        //                     console.log('Ошибка при перепуске ключа');
        //                 }

        //             }
        //             else callAnswerText = "❗️ У Вас нет активной подписки";
        //         }
        //     }
        //     btns.push([{callback_data: "/settings", text: BACK_BTN_TEXT}]);
        // }
        // else if(inCommand == '/topup')
        // {
        //     answText = "Выберите способ пополнения:";
        //     btns = [
        //         [
        //             {callback_data: "topup:crypto", text: "🌐 Криптовалюта"},
        //             {callback_data: "topup:sbp", text: "📱 СБП"},
        //         ],
        //         [
        //             {callback_data: "topup:history", text: "📋 История пополнений"},
        //         ],
        //         [{callback_data: "/start", text: BACK_BTN_TEXT}],
        //     ];
        // }
        // else if(inCommand == 'topup')
        // {
        //     const topupEvent = inMatches[2];
        //     if(topupEvent == 'history')
        //     {
        //         answText = "📋 История пополнений:";
        //     }
        //     else if(topupEvent == 'crypto')
        //     {
        //         answText = "Выберите:";
        //     }
        //     else if(topupEvent == 'sbp')
        //     {
        //         answText = "Выберите:";
        //     }
        //     btns.push([{callback_data: '/topup', text: BACK_BTN_TEXT}]);
        // }
        // ЕСЛИ Отпралена какая-то неизвестная команда
        else
        {
            if(eventType == 'callback')
            {
                callAnswerText = DEF_ANSWERTEXT;
            }
            else
            {
                newMsg = true;
                answText = DEF_ANSWERTEXT;
                btns = getMenuBtns(botUser, isAdmin);
            }
        }
        // ЕСЛИ Отпралена какая-то неизвестная команда

        
        // ЛОГИКА ДЛЯ АДМИНКИ
        if(isAdmin)
        {
            callAnswerText = false;
            if(inCommand == "/admin" || command == "🔐 Админка")
            {
                answText = "Админка";
                btns = [
                    [{callback_data: "admin:withdraw:list", text: "💸 Запросы на вывод"}],
                    [{callback_data: "admin:spam:head", text: "💌 Рассылка"}],
                    [{callback_data: "/start", text: BACK_BTN_TEXT}]
                ];
            }

            else if(inCommand == "admin")
            {
                const admCommand = inMatches[2];

                // Вывод средств
                if(admCommand == 'withdraw')
                {
                    const adminWithdrawCmd = inMatches[3];
                    if(adminWithdrawCmd == 'list')
                    {
                        answText = "Вся история выводов:";
                        answText += "\n⏳ - Ожидание ответа";
                        answText += "\n✅ - Вывод успешно заверешен";
                        answText += "\n❌ - Вывод отклонен";
                        btns = [];
                        const allPartnerWithdraws = await dbModels.PartnersHistory.findAll({where: {event_type: {[Op.startsWith]: 'withdraw'}}, order: [['id', 'DESC']]});
                        for(let wKey in allPartnerWithdraws)
                        {
                            const partnerWithdraw = allPartnerWithdraws[wKey];
                            const emj = withdraw_emjs[partnerWithdraw.event_type];
                            const btnText = emj +" №"+ partnerWithdraw.id +" | "+ defFuncs.timeFuncs.dateFromTimestamp(partnerWithdraw.createdAt) +" | "+ partnerWithdraw.withdraw_amount +"₽";
                            btns.push([{callback_data: "admin:withdraw:show:" + partnerWithdraw.id, text: btnText}]);
                        }
                        btns.push([{callback_data: "/admin", text: BACK_BTN_TEXT}]);
                    }
                    else if(adminWithdrawCmd == 'show')
                    {
                        const withdrawId = Number(inMatches[4]);
                        const exstWithdraw = await dbModels.PartnersHistory.findOne({where: {id: withdrawId}});
                        if(exstWithdraw !== null)
                        {
                            const withdrawBotUser = await dbModels.BotUser.findOne({where: {chat_id: exstWithdraw.inviterTgId}});
                            if(withdrawBotUser)
                            {
                                const emj = withdraw_emjs[exstWithdraw.event_type];
                                answText = emj +" <b>№"+ exstWithdraw.id +"</b> | <b>"+ defFuncs.timeFuncs.dateFromTimestamp(exstWithdraw.createdAt) +"</b>";
                                answText += "\n<b>💵 "+ exstWithdraw.withdraw_amount +" ₽</b>";
                                answText += "\n<b>💳 "+ exstWithdraw.withdraw_requisites +"</b>";
                                answText += '\n\n👤 Запрос от: <a href="tg://user?id='+ withdrawBotUser.chat_id +'">'+ withdrawBotUser.first_name +'</a>';
                                answText += '\n💰 Партнерский баланс: <b>' + withdrawBotUser.partner_balance +'₽</b>';
                                answText += '\n🧊 Всего в ожидании на вывод: <b>' + withdrawBotUser.partner_balance_rezerv +'₽</b>';
                                btns = [
                                    [{callback_data: "admin:withdraw:do:ok:" + exstWithdraw.id, text: "✅ Отметить выполненным"}],
                                    [{callback_data: "admin:withdraw:do:cancel:" + exstWithdraw.id, text: "❌ Отказать в выводе"}],
                                    [{callback_data: "admin:withdraw:list", text: "⬅️ К списку запросов"}],
                                    [{callback_data: "/start", text: MENU_BTN_TEXT}]
                                ];
                            }
                            else callAnswerText = "❗️ Пользователь не найден";
                        }
                        else callAnswerText = "❗️ Запрос на вывод не найден";
                    }
                    else if(adminWithdrawCmd == 'do')
                    {
                        const winthdrawDoEvent = inMatches[4];
                        const withdrawId = Number(inMatches[5]);
                        const exstWithdraw = await dbModels.PartnersHistory.findOne({where: {id: withdrawId}});
                        if(exstWithdraw !== null)
                        {
                            const transaction = await sequelize.transaction();
                            try
                            {
                                await dbModels.PartnersHistory.update({event_type: 'withdraw:' + winthdrawDoEvent}, {where: {id: exstWithdraw.id}});
                                
                                const withdrawDoEventTexts = {
                                    'ok': 'успешно ✅ выполнен',
                                    'cancel': '❌ отменен',
                                }
                                answText = "Запрос на вывод " + withdrawDoEventTexts[winthdrawDoEvent];
                                btns = [
                                    [{callback_data: "admin:withdraw:list", text: "⬅️ К списку запросов"}],
                                    [{callback_data: "/start", text: MENU_BTN_TEXT}]
                                ];
                                
                                const inviterNotfText = 'Ваш запрос на вывод <b>№'+ exstWithdraw.id +'</b> ' + withdrawDoEventTexts[winthdrawDoEvent];
                                await bot.sendMessage(exstWithdraw.inviterTgId, inviterNotfText, {parse_mode: 'HTML'});

                                await transaction.commit();
                            }
                            catch(Err)
                            {
                                await transaction.rollback();
                                console.log(Err);
                                callAnswerText = "⚠️ Не удалось выполнить действие. Попробуйте позднее";
                            }
                        }
                        else callAnswerText = "❗️ Запрос не найден";
                    }
                }
                // Вывод средств

                // Добавление/просмотр рассылок
                else if(admCommand == "spam")
                {
                    const adminSpamCmd = inMatches[3];
                    if(adminSpamCmd == 'head')
                    {
                        answText = "Рассылки:\n";
                        btns = []
                        btns.push([
                            {callback_data: "/admin", text: BACK_BTN_TEXT},
                            {callback_data: "admin:spam:new", text: "➕ Создать новую"}
                        ]);
                        let allSpams = await dbModels.Spam.findAll({order: [['id', 'DESC']]});
                        allSpams.forEach(spam => {

                            let spamStatus = 'Завершена';
                            if(spam.status == 'new') spamStatus = 'В очереди';
                            else if(spam.status != 'end') spamStatus = 'В процессе';
                            let btnText = "#"+ spam['id'] +" | "+ defFuncs.timeFuncs.dateFromTimestamp(spam.createdAt) +" | "+ spamStatus;

                            btns.push([{callback_data: "admin:spam:ind:" + spam.id, text: btnText}]);
                        });
                    }
                    else if(adminSpamCmd == "new")
                    {
                        answText = 'Отправьте одним сообщением содержимое рассылки (файл + описание или только одно из них)';
                        newUserInput = 'admin:spam:getmsg';
                        btns = [[{callback_data: "admin:spam:head", text: BACK_BTN_TEXT}]];
                    }
                    else if(adminSpamCmd == "getmsg")
                    {
                        await bot.sendMessage(chatId, "Рассылка будет выглядеть так:");

                        btns = [
                            [{callback_data: "admin:spam:send:" + mId, text: "Запустить рассылку"}],
                            [{callback_data: "/admin", text: CANCEL_BTN_TEXT}]
                        ];
                        let options = {
                            "reply_markup": defFuncs.toBtns(btns)
                        }
                        await bot.copyMessage(chatId, chatId, mId, options);
                        answText = false;
                    }
                    else if(adminSpamCmd == "send")
                    {
                        newMsg = true;
                        await bot.deleteMessage(chatId, mId);

                        const copy_mId = Number(inMatches[4]);
                        var exstSpam = await dbModels.Spam.findOne({where: {mId: copy_mId}});
                        if(exstSpam === null)
                        {
                            exstSpam = await dbModels.Spam.create({fromChatId: chatId, mId: copy_mId});
                            if(exstSpam !== null)
                            {
                                answText = "Рассылка №"+ exstSpam.id +" успешно запущена";
                                btns = [[{callback_data: "admin:spam:head", text: "◀️ К списку рассылок"}]];
                            }
                            else answText = "Не удалось запустить рассылку";
                        }
                        else sendMsg = 'Рассылка не найдена';
                    }
                    else if(adminSpamCmd == "ind")
                    {
                        const spamId = Number(inMatches[4]);
                        answText = false;

                        const exstSpam = await dbModels.Spam.findOne({where: {id: spamId}});
                        if(exstSpam !== null) await bot.copyMessage(chatId, exstSpam.fromChatId, exstSpam.mId);
                        else answText = 'Не удалось найти рассылку';
                    }
                    // Добавление/просмотр рассылок
                }
            }

        }
        // ЛОГИКА ДЛЯ АДМИНКИ

        // END BOT LOGIC



        // UPDATE BOT_USER: setNewInput
        await dbModels.BotUser.update(
            {
                input: newUserInput,
                user_data: inputData
            },
            {where: {id: botUser.id}}
        );
        // END UPDATE BOT_USER: setNewInput



        if(answText.length === 0) answText = false;

        // SEND ANSWER TO BOT
        if(eventType == "message")
        {
            if(kbds.length === 0) options.reply_markup = defFuncs.toBtns(btns);
            else options.reply_markup = defFuncs.toKbds(kbds);
            if(answText !== false) bot.sendMessage(chatId, answText, options);
        }
        else
        {
            const callOptions = {};
            if(callAnswerText)
            {
                callOptions.text = callAnswerText;
                callOptions.show_alert = true;
            }
            await bot.answerCallbackQuery(callId, callOptions);

            if(kbds.length === 0 && newMsg === false)
            {
                options.reply_markup = defFuncs.toBtns(btns);
                options.chat_id = chatId;
                if(answText !== false) bot.editMessageText(answText, options);
            }
            else
            {
                if(newMsg) options.reply_markup = defFuncs.toBtns(btns);
                else options.reply_markup = defFuncs.toKbds(kbds);
                if(answText) bot.sendMessage(chatId, answText, options);
            }
        }
        // END SEND ANSWER TO BOT
    }
    catch(Err)
    {
        console.log(Err);
    }

}

bot.on('message', async (message) => {
    botOn(message, "message");
});
bot.on('callback_query', async function onCallbackQuery(callbackQuery)
{
    botOn(callbackQuery, "callback");
});





function getMenuBtns(botUser, isAdmin)
{
    const tryBtn = botUser.tried ? [] : [{callback_data: '/try', text: "🎁 Пробный доступ — 7 дней"}];
    const admBtn = isAdmin ? [[{callback_data: '/admin', text: "🔐 Админка"}]] : [];
    const btns = [
        tryBtn,
        ...HEAD_MENU_BTNS,
        ...admBtn
    ];
    return btns;
}

async function sendMsgToAdmins(text, options)
{
    for(let aKey in HEAD_BOT_ADMIN_IDS)
    {
        const adm_chat_id = HEAD_BOT_ADMIN_IDS[aKey];
        try
        {
            await bot.sendMessage(adm_chat_id, text, options);
        }
        catch(Err)
        {
            console.log(Err);
        }
    }
}