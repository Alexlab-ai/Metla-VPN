/**
 * Combined web server for Render deployment.
 * Merges sub.js (subscription endpoint) and ykPay.js (YooKassa webhook)
 * into a single Express server on one PORT (required by Render).
 */
import express from 'express'
import 'dotenv/config'
import * as dbModels from './dbModels.js'
import TelegramBot from 'node-telegram-bot-api'
import { defFuncs } from './defFuncs.js'
import { marzbanFuncs } from './marzbanFuncs.js'

const PORT = process.env.PORT || 2873;

const TGBOT_TOKEN = process.env.TGBOT_TOKEN || '';
const YOOKASSA_TK = process.env.YOOKASSA_TK || '';
const MENU_BTN_TEXT = process.env.MENU_BTN_TEXT;
const DAYS_FROM_REF = Number(process.env.DAYS_FROM_REF) || 0;
const PARTNER_PERCENT = Number(process.env.PARTNER_PERCENT) || 0;

const bot = new TelegramBot(TGBOT_TOKEN, { polling: false });

const app = express();
app.set('view engine', 'ejs');

// Parse JSON body for YooKassa webhooks
app.use(express.json());

// Health check for Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// === Subscription endpoint (from sub.js) ===
const subGetRegEx = /^\/sub\/[^\n]*/;
app.get(subGetRegEx, async (req, res) => {
    try {
        const urlFileMatch = req.url.match(/^\/sub\/([^\/]+)/);
        if (urlFileMatch !== null) {
            const subKey = urlFileMatch[1];
            var keysResStr = "";
            try {
                const subLink = 'https://' + req.get('host') + '/s/' + subKey;
                const fetchRes = await fetch(subLink, { headers: { 'Accept-Type': 'application/json' } });
                const subInBase64 = await fetchRes.text();
                const subKeys = Buffer.from(subInBase64, 'base64').toString();

                const botUser = await dbModels.BotUser.findOne({ where: { sub_link: subLink.replace(/\/s\//, '/sub/') } });
                if (botUser !== null && botUser.sni !== null) {
                    const newSni = botUser.sni;
                    keysResStr = subKeys.replaceAll(/sni=([^&]*)/g, 'sni=' + newSni);
                    keysResStr = keysResStr.replaceAll(/host=([^&]*)/g, 'host=' + newSni);
                }
                else keysResStr = subKeys;
            }
            catch (Err) {
                console.log(Err);
            }
            res.send(Buffer.from(keysResStr).toString('base64'));
        }
        else res.send('404');
    }
    catch (Err) {
        console.log(Err);
    }
});

// === YooKassa webhook endpoint (from ykPay.js) ===
app.post('/yookassa/webhook', async (req, res) => {
    let statusCode = 200;

    try {
        const tk = req.query.tk;
        if (tk && tk == YOOKASSA_TK) {
            const inData = req.body;

            if (inData && inData.event !== undefined && inData.object !== undefined && inData.object.paid && inData.event == 'payment.succeeded') {
                const payObj = inData.object;
                if (payObj.id && payObj.paid === true && payObj.test === false) {
                    const payData = await defFuncs.getYkPaymentData(payObj.id);
                    if (payData.paid === true && payData.test === false) {
                        try {
                            const payLabel = payData.metadata.order_id;
                            const payLabelMatch = payLabel.match(/^([0-9]+):([0-9]+):([0-9]+)$/);

                            if (payLabelMatch !== null) {
                                const chatId = payLabelMatch[1];
                                const buyMonths = Number(payLabelMatch[2]);
                                const buyPrice = Number(payLabelMatch[3]);
                                const exstOperation = await dbModels.Pays.findOne({ where: { operationId: payData.id, payType: 'yookassa' } });

                                if (exstOperation === null) {
                                    await dbModels.Pays.create({
                                        uid: chatId,
                                        operationId: payData.id,
                                        payType: 'yookassa',
                                        payData: payData,
                                    });

                                    const botUser = await dbModels.BotUser.findOne({ where: { chat_id: chatId } });
                                    if (botUser !== null) {
                                        try {
                                            const EventTypeForPartnerHistory = botUser.buyed ? 'profit:prolong' : 'profit:buy';
                                            const newSubToTime = defFuncs.timeFuncs.timePlusMonth(buyMonths, botUser.subToTime);
                                            try {
                                                const updKeySubTimeRes = await marzbanFuncs.prolongSub(botUser, newSubToTime);
                                                if (updKeySubTimeRes) {
                                                    await dbModels.BotUser.update({ subToTime: newSubToTime, sub_link: updKeySubTimeRes.subscription_url, tried: true, buyed: true }, { where: { id: botUser.id } });
                                                    console.log('OK 0.1');
                                                    const payedMsg = "✅ Успешная оплата доступа на <b>" + buyMonths + " мес.</b>";
                                                    const options = {
                                                        reply_markup: defFuncs.toBtns([
                                                            [{ callback_data: "/settings", text: "⚙️ Установить VPN" }],
                                                            [{ callback_data: "/start", text: MENU_BTN_TEXT }],
                                                        ]),
                                                        parse_mode: "HTML"
                                                    };
                                                    await bot.sendMessage(botUser.chat_id, payedMsg, options);
                                                }
                                                else {
                                                    const ErrorMsg = "❗️ Платеж прошел, но не удалось продлить подписку. Обратитесь в поддержку (Ошибка #7h10j7)";
                                                    await bot.sendMessage(botUser.chat_id, ErrorMsg);
                                                }
                                            }
                                            catch (Err) {
                                                console.log(Err);
                                                const ErrorMsg = "❗️ Платеж прошел, но не удалось продлить подписку. Обратитесь в поддержку (Ошибка #7h9j7)";
                                                await bot.sendMessage(botUser.chat_id, ErrorMsg);
                                            }

                                            if (botUser.inviter_chat_id !== null && DAYS_FROM_REF > 0) {
                                                try {
                                                    const inviterBotUser = await dbModels.BotUser.findOne({ where: { chat_id: botUser.inviter_chat_id } });
                                                    if (inviterBotUser !== null) {
                                                        if (!botUser.from_partner) {
                                                            const inviterNewSubToTime = defFuncs.timeFuncs.timePlusDays(DAYS_FROM_REF, inviterBotUser.subToTime);
                                                            const updKeySubTimeInviterRes = await marzbanFuncs.prolongSub(inviterBotUser, inviterNewSubToTime);
                                                            if (updKeySubTimeInviterRes) {
                                                                console.log('OK 1.1');
                                                                await dbModels.BotUser.update({ subToTime: inviterNewSubToTime, sub_link: updKeySubTimeInviterRes.subscription_url }, { where: { id: inviterBotUser.id } });
                                                                await dbModels.RefsHistory.create({ inviterTgId: inviterBotUser.chat_id, refTgId: botUser.chat_id, event_type: 'payed:' + buyMonths });
                                                                const newRefNotfText = '🎁 Вам начислено <b>' + DAYS_FROM_REF + ' дней</b> за оплату доступа от реферала <a href="tg://user?id=' + botUser.chat_id + '">' + botUser.first_name + '</a>';
                                                                await bot.sendMessage(inviterBotUser.chat_id, newRefNotfText, { parse_mode: "HTML" });
                                                                console.log('OK 1.2');
                                                            }
                                                            else console.log('SKIP 3');
                                                        }
                                                        else {
                                                            console.log('OK 2.1');
                                                            const profitFromNewUser = Number((buyPrice * (PARTNER_PERCENT / 100)).toFixed(2));
                                                            await dbModels.PartnersHistory.create({
                                                                inviterTgId: inviterBotUser.chat_id,
                                                                refTgId: botUser.chat_id,
                                                                realAmount: buyPrice.toString(),
                                                                receivedAmount: profitFromNewUser.toString(),
                                                                percent: PARTNER_PERCENT,
                                                                event_type: EventTypeForPartnerHistory,
                                                                description: 'payed ' + buyPrice + '₽ for ' + buyMonths + ' months'
                                                            });
                                                            inviterBotUser.partner_balance = inviterBotUser.partner_balance ? Number(inviterBotUser.partner_balance) : 0;
                                                            const newPartnerBalance = (inviterBotUser.partner_balance + profitFromNewUser).toFixed(2);
                                                            await dbModels.BotUser.update({ partner_balance: newPartnerBalance }, { where: { id: inviterBotUser.id } });
                                                            const newUserFromPartnerNotfText = '🎁 По партерской программе Вам начислено <b>' + profitFromNewUser + ' ₽</b> за оплату доступа от <a href="tg://user?id=' + botUser.chat_id + '">' + botUser.first_name + '</a>';
                                                            await bot.sendMessage(inviterBotUser.chat_id, newUserFromPartnerNotfText, { parse_mode: "HTML" });
                                                            console.log('OK 2.2');
                                                        }
                                                    }
                                                    else console.log('SKIP 2');
                                                }
                                                catch (Err) {
                                                    console.log(Err);
                                                }
                                            }
                                            else console.log('SKIP 1');
                                        }
                                        catch (Err) {
                                            console.log(Err);
                                            const ErrorMsg = "❗️ Платеж прошел, но не удалось сохранить данные об оплате. Обратитесь в поддержку (Ошибка #7h6j7)";
                                            await bot.sendMessage(botUser.chat_id, ErrorMsg);
                                        }
                                    }
                                    else console.log('botUser == NULL');
                                }
                                else console.log('OPERATION EXST');
                            }
                            else console.log('payLabelMatch == NULL');
                        }
                        catch (Err) {
                            console.log(Err);
                        }
                    }
                }
            }
        }
    }
    catch (Err) {
        console.log(Err);
    }

    res.status(statusCode).send('OK');
});

app.listen(PORT, () => {
    console.log(`Web server started on port: ${PORT}`);
});
