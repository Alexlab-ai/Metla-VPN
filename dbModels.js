import sequelize from './dbPostgres.js'
import { DataTypes, } from 'sequelize'
import 'dotenv/config'

export const BotUser = sequelize.define('bot_users', {
    id: {type: DataTypes.INTEGER, primaryKey: true, unique: true, autoIncrement: true},
    chat_id: {type: DataTypes.STRING, unique: true},
    inviter_chat_id: {type: DataTypes.STRING},
    first_name: {type: DataTypes.STRING},
    last_name: {type: DataTypes.STRING},
    username: {type: DataTypes.STRING},
    language_code: {type: DataTypes.STRING},
    input: {type: DataTypes.STRING},

    from_partner: {type: DataTypes.BOOLEAN, defaultValue: false},
    partner_link: {type: DataTypes.STRING},
    partner_balance: {type: DataTypes.STRING},
    partner_balance_rezerv: {type: DataTypes.STRING},

    balance: {type: DataTypes.STRING},
    ref_balance: {type: DataTypes.STRING},
    ref_balance_to_withdraw: {type: DataTypes.STRING},
    profit_to_inviter: {type: DataTypes.STRING},

    user_data: {type: DataTypes.JSON},
    user_data_last_upd: {type: DataTypes.BIGINT, defaultValue: 0},

    sub_link: {type: DataTypes.STRING, defaultValue: ''},
    sni: {type: DataTypes.STRING},
    subToTime: {type: DataTypes.BIGINT, defaultValue: 0},
    tried: {type: DataTypes.BOOLEAN, defaultValue: false},
    buyed: {type: DataTypes.BOOLEAN, defaultValue: false},
},
{
    paranoid: true,
    deletedAt: 'destroyTime'
});
export const RefsHistory = sequelize.define('refs_history', {
    id: {type: DataTypes.INTEGER, primaryKey: true, unique: true, autoIncrement: true},
    inviterTgId: {type: DataTypes.STRING, defaultValue: ""},
    refTgId: {type: DataTypes.STRING, defaultValue: ""},
    realAmount: {type: DataTypes.STRING},
    receivedAmount: {type: DataTypes.STRING},
    percent: {type: DataTypes.INTEGER, defaultValue: 0},
    withdraw_amount: {type: DataTypes.STRING},
    event_type: {type: DataTypes.STRING},
    from_partner: {type: DataTypes.BOOLEAN, defaultValue: false},
});
export const PartnersHistory = sequelize.define('partners_history', {
    id: {type: DataTypes.INTEGER, primaryKey: true, unique: true, autoIncrement: true},
    inviterTgId: {type: DataTypes.STRING, defaultValue: ""},
    refTgId: {type: DataTypes.STRING, defaultValue: ""},
    realAmount: {type: DataTypes.STRING},
    receivedAmount: {type: DataTypes.STRING},
    percent: {type: DataTypes.INTEGER, defaultValue: 0},
    withdraw_amount: {type: DataTypes.STRING},
    withdraw_requisites: {type: DataTypes.STRING},
    event_type: {type: DataTypes.STRING},
    description: {type: DataTypes.STRING},
});
export const SupportMsgs = sequelize.define('support_msgs', {
    id: {type: DataTypes.INTEGER, primaryKey: true, unique: true, autoIncrement: true},
    userTgId: {type: DataTypes.STRING, defaultValue: ""},
    supportTgId: {type: DataTypes.STRING, defaultValue: ""},
    text: {type: DataTypes.TEXT},
    mId: {type: DataTypes.INTEGER},
    msg_data: {type: DataTypes.JSON},
});
export const Pays = sequelize.define('pays', {
    id: {type: DataTypes.INTEGER, primaryKey: true, unique: true, autoIncrement: true},
    uid: {type: DataTypes.STRING, defaultValue: ""},
    operationId: {type: DataTypes.STRING, defaultValue: ""},
    payType: {type: DataTypes.STRING, defaultValue: ""},
    payData: {type: DataTypes.JSON},
},
{
    paranoid: true,
    deletedAt: 'destroyTime'
});
export const Spam = sequelize.define('spam', {
    id: {type: DataTypes.INTEGER, primaryKey: true, unique: true, autoIncrement: true},
    fromChatId: {type: DataTypes.STRING, defaultValue: ""},
    mId: {type: DataTypes.INTEGER},
    last_id: {type: DataTypes.INTEGER},
    status: {type: DataTypes.STRING, defaultValue: "new"},
});