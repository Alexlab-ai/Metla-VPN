import TelegramBot from 'node-telegram-bot-api'
import 'dotenv/config'
import { Op } from 'sequelize'
import * as dbModels from './dbModels.js'
import { defFuncs } from './defFuncs.js';


const HOURS_FOR_SUB_EXPIRE_NOTF = process.env.HOURS_FOR_SUB_EXPIRE_NOTF.split(',') || [0, 1, 24];
const MENU_BTN_TEXT = process.env.MENU_BTN_TEXT;

const TGBOT_TOKEN = process.env.TGBOT_TOKEN || '';
const bot = new TelegramBot(TGBOT_TOKEN, {polling: false});

while (true)
{
    await defFuncs.delay(3000);
    await subsStatusNotf();
    await spam();
    // break;
}

process.exit();

async function subsStatusNotf()
{
    try
    {
        for(let nKey in HOURS_FOR_SUB_EXPIRE_NOTF)
        {
            const hourForNotf = HOURS_FOR_SUB_EXPIRE_NOTF[nKey];
            const expireTime = Math.round(defFuncs.timeFuncs.time() + hourForNotf * 3600);
            
            const botUsers = await dbModels.BotUser.findAll({where: {
                subToTime: {[Op.lte]: expireTime, [Op.gt]: 0},
                sub_notf_last_day: {[Op.gt]: hourForNotf, [Op.lte]: 1000}
            }});

            for(let bKey in botUsers)
            {
                const botUser = botUsers[bKey];
                try
                {
                    botUser.balance = botUser.balance === null ? 0 : Number(botUser.balance);
                    let notfText = '';
                    if(hourForNotf > 0)
                    {
                        await dbModels.BotUser.update({sub_notf_last_day: hourForNotf}, {where: {id: botUser.id}});
                        notfText = "⚠️ Ваш доступ к VPN <b>истекает</b> менее чем через <b>"+ hourForNotf +"ч.</b>";
                    }
                    else
                    {
                        notfText = "❗️ Ваш доступ к VPN истек";
                        await dbModels.BotUser.update({sub_notf_last_day: 1000, subToTime: 0}, {where: {id: botUser.id}});
                    }
                    const notfOptions = {
                        parse_mode: 'HTML',
                        reply_markup: defFuncs.toBtns([
                            [{callback_data: "/buy", text: "🔑 Приобрести подписку"}],
                            [{callback_data: '/start', text: MENU_BTN_TEXT}],
                        ])
                    };
                    await bot.sendMessage(botUser.chat_id, notfText, notfOptions);
                }
                catch(Err)
                {
                    console.log(Err);
                }
            }
        }
    }
    catch(Err)
    {
        console.log(Err);
    }
}

async function spam()
{
    try
    {
        const spams = await dbModels.Spam.findAll({where: {status: {[Op.not]: "end"}}});
        if(spams.length == 0) return;

        const botUsers = await dbModels.BotUser.findAll();
        if(botUsers.length == 0)
        {
            await dbModels.Spam.update({status: 'end'}, {where: {id: {[Op.ne]: 0}}});
            return;
        }

        const lastBotUserId = botUsers[botUsers.length - 1].id;

        for(let spamKey in spams)
        {
            const spam = spams[spamKey]['dataValues'];
            await dbModels.Spam.update({status: 'wait'}, {where: {id: spam.id}});

            for(let botUserKey in botUsers)
            {
                const botUser = botUsers[botUserKey]['dataValues'];
                if(lastBotUserId == botUser.id || lastBotUserId == 0)  await dbModels.Spam.update({status: 'end'}, {where: {id: spam.id}});

                try
                {
                    await bot.copyMessage(botUser.chat_id, spam.fromChatId, spam.mId);
                }
                catch(err)
                {
                    console.log(err);
                }
            }
        }
    }
    catch(Err)
    {
        console.log(Err);
    }
}