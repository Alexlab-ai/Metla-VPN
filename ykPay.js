import http from 'http'
import sha1 from 'sha1'
import 'dotenv/config'
import * as dbModels from './dbModels.js'
import TelegramBot from 'node-telegram-bot-api'
import { defFuncs } from './defFuncs.js'
import { marzbanFuncs } from './marzbanFuncs.js'

const TGBOT_TOKEN = process.env.TGBOT_TOKEN || '';

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || 0;
const YOOKASSA_KEY = process.env.YOOKASSA_KEY || '';
const YOOKASSA_TK = process.env.YOOKASSA_TK || '';

const MENU_BTN_TEXT = process.env.MENU_BTN_TEXT;
const DAYS_FROM_REF = Number(process.env.DAYS_FROM_REF) || 0;
const PARTNER_PERCENT = Number(process.env.PARTNER_PERCENT) || 0;

const bot = new TelegramBot(TGBOT_TOKEN, {polling: false});

http.createServer(function (request, response)
{
    let data = '';
    request
    .on('data', chunk => {
        data += chunk;
    })
    .on('end', async () => {

        let statusCode = 500;
        
        var searchParameters = new URLSearchParams(request.url.replace(/[^\?]+/, ""));
        var getData = {};
        for(var searchParameter of searchParameters)
        {
            getData[searchParameter[0]] = searchParameter[1];
        }
        // console.log('getData:', getData);

        if('tk' in getData && getData.tk == YOOKASSA_TK)
        {
            // console.log('data:', data);
            // searchParameters = new URLSearchParams(data);
            const inData = data && data.length > 0 ? JSON.parse(data) : null;
            // for(var searchParameter of searchParameters)
            // {
            //     inData[searchParameter[0]] = searchParameter[1];
            // }

            // console.log('inData:', inData);

            if(inData && inData.event !== undefined && inData.object !== undefined && inData.object.paid && inData.event == 'payment.succeeded')
            {
                const payObj = inData.object;
                if(payObj.id && payObj.paid === true && payObj.test === false)
                {
                    const payData = await defFuncs.getYkPaymentData(payObj.id);
                    // console.log('payData:', payData);
                    if(payData.paid === true && payData.test === false)
                    {
                        try
                        {
                            statusCode = 200;

                            const payLabel = payData.metadata.order_id;
                            // console.log('payLabel:', payLabel);
                            const payLabelMatch = payLabel.match(/^([0-9]+):([0-9]+):([0-9]+)$/);
                            // console.log('payLabelMatch:', payLabelMatch);

                            if(payLabelMatch !== null)
                            {
                                const chatId = payLabelMatch[1];
                                const buyMonths = Number(payLabelMatch[2]);
                                const buyPrice = Number(payLabelMatch[3]);
                                const exstOperation = await dbModels.Pays.findOne({where: {operationId: payData.id, payType: 'yookassa'}});
                                // console.log('exstOperation', exstOperation);

                                if(exstOperation === null)
                                {
                                    await dbModels.Pays.create({
                                        uid: chatId,
                                        operationId: payData.id,
                                        payType: 'yookassa',
                                        payData: payData,
                                    });

                                    const botUser = await dbModels.BotUser.findOne({where: {chat_id: chatId}});
                                    // console.log('botUser:', botUser);
                                    if(botUser !== null)
                                    {
                                        try
                                        {
                                            const EventTypeForPartnerHistory = botUser.buyed ? 'profit:prolong' : 'profit:buy';
                                            const newSubToTime = defFuncs.timeFuncs.timePlusMonth(buyMonths, botUser.subToTime);
                                            try
                                            {
                                                const updKeySubTimeRes = await marzbanFuncs.prolongSub(botUser, newSubToTime);
                                                if(updKeySubTimeRes)
                                                {
                                                    await dbModels.BotUser.update({subToTime: newSubToTime, sub_link: updKeySubTimeRes.subscription_url, tried: true, buyed: true}, {where: {id: botUser.id}});

                                                    console.log('OK 0.1');

                                                    const payedMsg = "✅ Успешная оплата доступа на <b>"+ buyMonths +" мес.</b>";
                                                    const options = {
                                                        reply_markup: defFuncs.toBtns([
                                                            [{callback_data: "/settings", text: "⚙️ Установить VPN"}],
                                                            [{callback_data: "/start", text: MENU_BTN_TEXT}],
                                                        ]),
                                                        parse_mode: "HTML"
                                                    };
                                                    await bot.sendMessage(botUser.chat_id, payedMsg, options);
                                                }
                                                else
                                                {
                                                    const ErrorMsg = "❗️ Платеж прошел, но не удалось продлить подписку. Обратитесь в поддержку (Ошибка #7h10j7)";
                                                    await bot.sendMessage(botUser.chat_id, ErrorMsg);
                                                }
                                            }
                                            catch(Err)
                                            {
                                                console.log(Err);
                                                const ErrorMsg = "❗️ Платеж прошел, но не удалось продлить подписку. Обратитесь в поддержку (Ошибка #7h9j7)";
                                                await bot.sendMessage(botUser.chat_id, ErrorMsg);
                                            }
                                            
                                            if(botUser.inviter_chat_id !== null && DAYS_FROM_REF > 0)
                                            {
                                                try
                                                {
                                                    const inviterBotUser = await dbModels.BotUser.findOne({where: {chat_id: botUser.inviter_chat_id}});
                                                    if(inviterBotUser !== null)
                                                    {
                                                        if(!botUser.from_partner)
                                                        {
                                                            const inviterNewSubToTime = defFuncs.timeFuncs.timePlusDays(DAYS_FROM_REF, inviterBotUser.subToTime);
                                                            const updKeySubTimeInviterRes = await marzbanFuncs.prolongSub(inviterBotUser, inviterNewSubToTime);
                                                            if(updKeySubTimeInviterRes)
                                                            {
                                                                console.log('OK 1.1'); 
                                                                await dbModels.BotUser.update({subToTime: inviterNewSubToTime, sub_link: updKeySubTimeInviterRes.subscription_url}, {where: {id: inviterBotUser.id}});
                                                                await dbModels.RefsHistory.create({inviterTgId: inviterBotUser.chat_id, refTgId: botUser.chat_id, event_type: 'payed:' + buyMonths});

                                                                const newRefNotfText = '🎁 Вам начислено <b>'+ DAYS_FROM_REF +' дней</b> за оплату доступа от реферала <a href="tg://user?id='+ botUser.chat_id +'">'+ botUser.first_name +'</a>';
                                                                await bot.sendMessage(inviterBotUser.chat_id, newRefNotfText, {parse_mode: "HTML"});

                                                                console.log('OK 1.2');
                                                            }
                                                            else console.log('SKIP 3');
                                                        }
                                                        else
                                                        {
                                                            console.log('OK 2.1');
                                                            const profitFromNewUser = Number((buyPrice * (PARTNER_PERCENT / 100)).toFixed(2));
                                                            await dbModels.PartnersHistory.create({
                                                                inviterTgId: inviterBotUser.chat_id,
                                                                refTgId: botUser.chat_id,
                                                                realAmount: buyPrice.toString(),
                                                                receivedAmount: profitFromNewUser.toString(),
                                                                percent: PARTNER_PERCENT,
                                                                event_type: EventTypeForPartnerHistory,
                                                                description: 'payed '+ buyPrice +'₽ for '+ buyMonths +' months'
                                                            });

                                                            inviterBotUser.partner_balance = inviterBotUser.partner_balance ? Number(inviterBotUser.partner_balance) : 0;
                                                            const newPartnerBalance = (inviterBotUser.partner_balance + profitFromNewUser).toFixed(2);
                                                            await dbModels.BotUser.update({partner_balance: newPartnerBalance}, {where: {id: inviterBotUser.id}});

                                                            const newUserFromPartnerNotfText = '🎁 По партерской программе Вам начислено <b>'+ profitFromNewUser +' ₽</b> за оплату доступа от <a href="tg://user?id='+ botUser.chat_id +'">'+ botUser.first_name +'</a>';
                                                            await bot.sendMessage(inviterBotUser.chat_id, newUserFromPartnerNotfText, {parse_mode: "HTML"});
                                                            
                                                            console.log('OK 2.2');
                                                        }
                                                    }
                                                    else console.log('SKIP 2');
                                                }
                                                catch(Err)
                                                {
                                                    console.log(Err);
                                                }
                                            }
                                            else console.log('SKIP 1');
                                        }
                                        catch(Err)
                                        {
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
                        catch(Err)
                        {
                            console.log(Err);
                        }
                    }
                }
            }
        }
        response.statusCode = statusCode;
        response.end('OK');
    });

}).listen(2517);