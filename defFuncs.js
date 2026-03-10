import 'dotenv/config'
import fs from 'fs'
import crypto from 'crypto'
import axios from 'axios'

const TIME_ZONE = Number(process.env.TIME_ZONE) || 0;
const YOOMONEY_NUM = process.env.YOOMONEY_NUM || '';

const YOOKASSA_KEY = process.env.YOOKASSA_KEY || '';
const YOOKASSA_SHOP_ID = Number(process.env.YOOKASSA_SHOP_ID) || 0;

export const defFuncs = {
    
    delay: async function(time)
    {
        return new Promise(function(resolve){ setTimeout(resolve, time) });
    },
    random: function (min, max)
    {
        const minCeiled = Math.ceil(min);
        const maxFloored = Math.floor(max);
        return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled);
    },
    in_array: function (needle, haystack)
    {
        if(!haystack) return false;
        if (typeof haystack != "array" && typeof haystack != "object") return false;
        var length = haystack.length;
        for(var i = 0; i < length; i++)
        {
            if(haystack[i] == needle) return true;
        }
        return false;
    },
    timeFuncs: {
        time: function ()
        {
            return Math.round((new Date().getTime() / 1000) + 3600 * TIME_ZONE);
        },
        timePlusMonth: function (plusMonths = 0, time = 0)
        {
            var today = today = new Date();
            if(time > 0) today = new Date(Math.round((Number(time)) * 1000));
            const newDate = new Date(today.setMonth(today.getMonth() + plusMonths))
            return Math.round((newDate.getTime() / 1000) + 3600 * TIME_ZONE);
        },
        timePlusDays: function (plusDays = 0, time = 0)
        {
            var today = today = new Date();
            if(time > 0) today = new Date(Math.round((Number(time)) * 1000));
            const newDate = new Date(today.setDate(today.getDate() + plusDays))
            return Math.round((newDate.getTime() / 1000) + 3600 * TIME_ZONE);
        },
        strtotime: function (str)
        {
            if(typeof str === 'string') str = str.replace(/^([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})/, '$2.$1.$3');
            const time = Date.parse(str);
            if(time > 0) return Math.round((time / 1000) + 3600 * TIME_ZONE);
            else return false;
        },
        dateFromTime: function (time)
        {
            const date = new Date(Math.round((Number(time)) * 1000));

            let days = date.getDate();
            if(days < 10) days = "0" + days;
            let month = date.getMonth();
            month++;
            if(month < 10) month = "0" + month;
            let hours = date.getHours();
            if(hours < 10) hours = "0" + hours;
            let minutes = date.getMinutes();
            if(minutes < 10) minutes = "0" + minutes;

            return days + "." + month + "." + date.getFullYear() + " " + hours + ":" + minutes;
        },
        dayMonthFromTime: function (time)
        {
            const date = new Date((time - 3600 * TIME_ZONE) * 1000);

            let days = date.getDate();
            if(days < 10) days = "0" + days;
            let month = date.getMonth();
            month++;
            if(month < 10) month = "0" + month;

            return days + "." + month;
        },
        dateFromTimestamp: function (timstamp)
        {
            const time = this.strtotime(timstamp);
            return this.dateFromTime(time);
        },
        dayMonthFromTimestamp: function (timstamp)
        {
            const time = this.strtotime(timstamp);
            return this.dayMonthFromTime(time);
        },
        timeFromTimestamp: function (timstamp)
        {
            const time = this.strtotime(timstamp);
            return time;
        },
    },
    randomString: function(length = 10)
    {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    toBtns: function (btns)
    {
        let obj = {
            inline_keyboard: btns
        };
        return JSON.stringify(obj);
    },
    toKbds: function (kbds)
    {
        let obj = {
            keyboard: kbds,
            resize_keyboard: true,
        };
        return JSON.stringify(obj);
    },
    getMyRefs: async function(chat_id)
    {
        const myRefferalsArr = [];
        let checkRefsIds = [chat_id];
        const allRefsArr = [];
    
        for(let i = 0; i < 10; i++)
        {
            const myRefferals = await botUserModel.findAll({where: {inviter_chat_id: checkRefsIds}});
    
            if(myRefferals.length > 0)
            {
                let indRefObj = {};
                indRefObj.line = i + 1;
                
                // indRefObj.refs = myRefferals;
                myRefferalsArr.push(indRefObj);
                checkRefsIds = [];
                let realCount = 0;
                for(let myRefferalsKey in myRefferals)
                {
                    checkRefsIds.push(myRefferals[myRefferalsKey].chat_id);
                    if(!customFuncs.in_array(myRefferals[myRefferalsKey].chat_id, allRefsArr))
                    {
                        allRefsArr.push(myRefferals[myRefferalsKey].chat_id);
                        realCount++;
                    }
                }
                indRefObj.count = realCount;
            }
            else break;
        }
        return {myRefferalsArr: myRefferalsArr, allRefsArr: allRefsArr};
    },
    generateYoomoneyPayLink: async function(amount, label = '')
    {
        const payNum = this.timeFuncs.time().toString();
        const url = "https://yoomoney.ru/quickpay/confirm.xml";
        const dataReq = new URLSearchParams({
            "receiver": YOOMONEY_NUM,
            "label": label,
            "quickpay-form": "shop",
            "targets": "№" + payNum,
            "sum": amount,
            "paymentType": "AC",
            "formcomment": "Оплата доступа"
        });
        return url + "?" + dataReq.toString();
    },
    getYooKassaPayLink: async function(amount, label, desc = 'Оплата доступа')
    {
        try
        {
            const idempotenceKey = crypto.randomUUID();
            console.log('idempotenceKey:', idempotenceKey);
            const fetchOptions = {
                auth: {
                    username: YOOKASSA_SHOP_ID,
                    password: YOOKASSA_KEY
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotence-Key': idempotenceKey
                }
            };
            const payData = {
                amount: {
                    value: Number(amount).toFixed(2),
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: "redirect",
                    return_url: "https://t.me/metlaVPN_bot"
                },
                metadata: {
                    order_id: label
                },
                receipt: {
                    customer: {
                        email: this.randomString(10) + '@'+ this.randomString(5) +'.ru'
                    },
                    items: [
                        {
                            description: desc,
                            quantity: 1,
                            amount: {
                                value:  Number(amount).toFixed(2),
                                currency: "RUB"
                            },
                            vat_code: 4, // 1 = 20% НДС, 2 = 10%, 3 = 0%, 4 = без НДС
                            payment_mode: 'full_payment',
                            payment_subject: 'commodity'
                        }
                    ]
                },
                description: desc
            };
            const axiosRes = await axios.post('https://api.yookassa.ru/v3/payments', payData, fetchOptions);
            const resData = await axiosRes.data;
            // console.log('resData:', resData);
            return resData.confirmation.confirmation_url;
        }
        catch(Err)
        {
            console.log(Err);
            return false;
        }
    },
    getYkPaymentData: async function(paymentId)
    {
        try
        {
            const fetchOptions = {
                auth: {
                    username: YOOKASSA_SHOP_ID,
                    password: YOOKASSA_KEY
                }
            };
            const axiosRes = await axios.get('https://api.yookassa.ru/v3/payments/' + paymentId, fetchOptions);
            const resData = await axiosRes.data;
            return resData;
        }
        catch(Err)
        {
            console.log(Err);
            return false;
        }
    },
    getTarifs: async function()
    {
        const tarifs = JSON.parse(await fs.readFileSync('tarifs.json'));
        return tarifs;
    }
};
