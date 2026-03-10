import express from 'express'
import 'dotenv/config'
import * as dbModels from './dbModels.js'


const WEB_PORT = 2873;
const PROJECT_DIR = '/sub/';

const app = express();
app.set('view engine', 'ejs')

const appGetRegEx = new RegExp(PROJECT_DIR + '[^\n]*');
app.get(appGetRegEx, async (req, res) => {

    try
    {
        const urlFileMatch = req.url.match(/^\/sub\/([^\/]+)/);
        if(urlFileMatch !== null)
        {
            const subKey = urlFileMatch[1];
            var keysResStr = "";
            try
            {
                const subLink = 'https://'+ req.get('host') + '/s/' + subKey;
                // console.log('subLink:', subLink);
                const fetchRes = await fetch(subLink, {headers: {'Accept-Type': 'application/json'}});
                const subInBase64 = await fetchRes.text();
                const subKeys = Buffer.from(subInBase64, 'base64').toString();

                const botUser = await dbModels.BotUser.findOne({where: {sub_link: subLink.replace(/\/s\//, '/sub/')}});
                if(botUser !== null && botUser.sni !== null)
                {
                    const newSni = botUser.sni;
                    keysResStr = subKeys.replaceAll(/sni=([^&]*)/g, 'sni=' + newSni);
                    keysResStr = keysResStr.replaceAll(/host=([^&]*)/g, 'host=' + newSni);
                }
                else keysResStr = subKeys;
            }
            catch(Err)
            {
                console.log(Err);
            }

            res.send(Buffer.from(keysResStr).toString('base64'));

        }
        else res.send('404');
    }
    catch(Err)
    {
        console.log(Err);
    }
    
});

app.listen(WEB_PORT, () => {
    console.log(`Сервер запущен на порт: ${WEB_PORT}`);
});