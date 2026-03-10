import { error } from 'console';
import 'dotenv/config'
import fs from 'fs'
import { defFuncs } from './defFuncs.js';

const MARZBAN_WEB_ADMIN = process.env.MARZBAN_WEB_ADMIN || '';
const MARZBAN_LOGIN = process.env.MARZBAN_LOGIN || '';
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD || '';
const MAX_DEVICES = Number(process.env.MAX_DEVICES) || 0;
const DATA_LIMIT = Number(process.env.DATA_LIMIT) * (2 ** 30) || null;
const USERNAME_SLUG = process.env.USERNAME_SLUG || 'tg_';

const marzbanAccessFile = 'marzban_access.json';

export const marzbanFuncs = {
    
    admin_url: MARZBAN_WEB_ADMIN,

    login: async function ()
    {
        var accessToken = false;
        try
        {
            const formData = new FormData();
            formData.append('username', MARZBAN_LOGIN);
            formData.append('password', MARZBAN_PASSWORD);
            formData.append('grant_type', 'password');
            const fetchOptions = {
                method: 'POST',
                body: formData
            };
            const fetchRes = await fetch(this.admin_url + 'api/admin/token', fetchOptions);
            const resJson = await fetchRes.json();
            if(resJson.access_token !== undefined && resJson.access_token.length > 0)
            {
                await fs.writeFileSync(marzbanAccessFile, JSON.stringify(resJson));
                accessToken = resJson.access_token;
            }
        }
        catch(Err)
        {
            console.log('Не удалось войти в Marzban');
            return false;
        }
        return accessToken;
    },
    getAccessToken: async function()
    {

        var accessToken = false;
        if(fs.existsSync(marzbanAccessFile))
        {
            try
            {
                const accessTokenData = JSON.parse(fs.readFileSync(marzbanAccessFile));
                const checkSystemRes = await this.checkSystem(accessTokenData.access_token);
                if(checkSystemRes === true) accessToken = accessTokenData.access_token;
            }
            catch(Err)
            {
                console.log('Error AccessToken From File');
                console.log(Err);
                console.log('Error AccessToken From File');
            }
        }
        if(accessToken === false) accessToken = await this.login();
        return accessToken;
    },
    checkSystem: async function(accessToken)
    {
        try
        {
            const fetchOptions = {
                headers: {
                    "Authorization": 'Bearer ' + accessToken
                }
            };
            const fetchRes = await fetch(this.admin_url + 'api/system', fetchOptions);
            const resData = await fetchRes.json();
            if(resData.cpu_cores !== undefined && resData.cpu_cores >= 0) return true;
            else return false;
        }
        catch(Err)
        {
            console.log('Не удалось SYSTEM в Marzban');
            return false;
        }
    },
    get: async function(method)
    {
        const accessToken = await this.getAccessToken();
        if(accessToken === false) return false;

        const resData = {error: true, error_text: 'Unknown Error'};
        try
        {
            const fetchOptions = {
                headers: {
                    "Authorization": 'Bearer ' + accessToken
                }
            };
            const fetchRes = await fetch(this.admin_url + method, fetchOptions);
            const resData = await fetchRes.json();
            // console.log('resData:', resData);
            return resData;
        }
        catch(Err)
        {
            console.log('Marzban '+ method +' GET Error');
        }
        return resData;
    },
    post: async function(method, data)
    {
        const accessToken = await this.getAccessToken();
        if(accessToken === false) return false;

        const resData = {error: true, error_text: 'Unknown Error'};
        try
        {
            const fetchOptions = {
                method: 'POST',
                headers: {
                    "Authorization": 'Bearer ' + accessToken,
                    "Content-Type": 'application/json'
                },
                body: JSON.stringify(data)
            };
            const fetchRes = await fetch(this.admin_url + method, fetchOptions);
            if(fetchRes.status === 409) return 409;
            const resData = await fetchRes.json();
            return resData;
        }
        catch(Err)
        {
            console.log('Marzban '+ method +' POST Error');
            // console.log(Err);
            // console.log('Marzban '+ method +' POST Error');
        }
        return resData;
    },
    put: async function(method, data)
    {
        const accessToken = await this.getAccessToken();
        if(accessToken === false) return false;

        const resData = {error: true, error_text: 'Unknown Error'};
        try
        {
            const fetchOptions = {
                method: 'PUT',
                headers: {
                    "Authorization": 'Bearer ' + accessToken,
                    "Content-Type": 'application/json'
                },
                body: JSON.stringify(data)
            };
            const fetchRes = await fetch(this.admin_url + method, fetchOptions);
            if(fetchRes.status === 409) return 409;
            const resData = await fetchRes.json();
            return resData;
        }
        catch(Err)
        {
            console.log('Marzban '+ method +' POST Error');
            // console.log(Err);
            // console.log('Marzban '+ method +' POST Error');
        }
        return resData;
    },
    createUser: async function(botUser, subDays)
    {
        try
        {
            const subToTime = Math.round(defFuncs.timeFuncs.time() + (Number(subDays) * 86400));
            const accessToken = await this.getAccessToken();
            if(accessToken === false) return false;

            const Config = await this.get('api/core/config');
            if(Config.inbounds !== undefined && Config.inbounds.length > 0)
            {
                const inbounds = {};
                for(let iKey in Config.inbounds)
                {
                    const inbound = Config.inbounds[iKey];
                    if(inbounds[inbound.protocol] === undefined) inbounds[inbound.protocol] = [];
                    inbounds[inbound.protocol].push(inbound.tag);
                }
                const username = USERNAME_SLUG + botUser.chat_id;
                const newUserData = {
                    "status": "active",
                    "username": username,
                    "note": botUser.first_name + botUser.last_name === null ? '' : botUser.last_name,
                    "proxies": {
                        "vless": {
                            "flow": ""
                        }
                    },
                    "data_limit": DATA_LIMIT,
                    "expire": subToTime,
                    "data_limit_reset_strategy": "no_reset",
                    "inbounds": inbounds,
                    "sni": 'avito.com',
                    "max_devices": MAX_DEVICES
                };
                const createUserRes = await this.post('api/user', newUserData);
                if(createUserRes.subscription_url !== undefined && createUserRes.username !== undefined && createUserRes.username === username)
                {
                    createUserRes.subscription_url = createUserRes.subscription_url.replace(/\/s\//, '/sub/');
                    return createUserRes;
                }
                else if(createUserRes === 409) return 409;
                else return false;
            }
            else return false;
        }
        catch(Err)
        {
            console.log(Err);
            return false;
        }
    },
    getExstUser: async function(botUser)
    {
        try
        {
            const username = USERNAME_SLUG + botUser.chat_id;
            const subUser = await this.get('api/user/' + username);
            if(subUser.subscription_url !== undefined)
            {
                if(subUser.subscription_url) subUser.subscription_url = subUser.subscription_url.replace(/\/s\//, '/sub/');
                return subUser;
            }
            else return false;
        }
        catch(Err)
        {
            console.log('Error get exst user - ' + username);
            return false;
        }
    },
    getSubUser: async function(botUser, subDays)
    {
        var subUser = await this.getExstUser(botUser);
        if(subUser === false)
        {
            if(subUser.subscription_url) subUser.subscription_url = subUser.subscription_url.replace(/\/s\//, '/sub/');
            subUser = await this.createUser(botUser, subDays);
        }
        return subUser;
    },
    remokeSubUser: async function(botUser)
    {
        try
        {
            const username = USERNAME_SLUG + botUser.chat_id;
            const subUser = await this.post('api/user/'+ username +'/revoke_sub');
            if(subUser && subUser.subscription_url !== undefined)
            {
                if(subUser.subscription_url) subUser.subscription_url = subUser.subscription_url.replace(/\/s\//, '/sub/');
                return subUser;
            }
            else return false;
        }
        catch(Err)
        {
            console.log('Error POST revoke_sub - ' + username);
            return false;
        }
    },
    prolongSub: async function(botUser, newSubToTime)
    {
        try
        {
            const accessToken = await this.getAccessToken();
            if(accessToken === false) return false;

            const Config = await this.get('api/core/config');
            if(Config.inbounds !== undefined && Config.inbounds.length > 0)
            {
                const inbounds = {};
                for(let iKey in Config.inbounds)
                {
                    const inbound = Config.inbounds[iKey];
                    if(inbounds[inbound.protocol] === undefined) inbounds[inbound.protocol] = [];
                    inbounds[inbound.protocol].push(inbound.tag);
                }
                const username = USERNAME_SLUG + botUser.chat_id;
                const newUserData = {
                    "status": "active",
                    "username": username,
                    "note": botUser.first_name + botUser.last_name === null ? '' : botUser.last_name,
                    "proxies": {
                        "vless": {
                            "flow": ""
                        }
                    },
                    "data_limit": DATA_LIMIT,
                    "expire": newSubToTime,
                    "data_limit_reset_strategy": "no_reset",
                    "inbounds": inbounds,
                    "max_devices": MAX_DEVICES
                };
                const updUserRes = await this.put('api/user/'+ username, newUserData);
                if(updUserRes.expire !== undefined && updUserRes.expire === newSubToTime && updUserRes.username !== undefined && updUserRes.username === username)
                {
                    updUserRes.subscription_url = updUserRes.subscription_url.replace(/\/s\//, '/sub/');
                    return updUserRes;
                }
                else if(updUserRes === 409) return 409;
                else return false;
            }
            else
            {
                console.log('FALSE Config');
                return false;
            }
        }
        catch(Err)
        {
            console.log(Err);
            return false;
        }
    }
}