import { Sequelize, Transaction, Op, Model, DataTypes } from 'sequelize'
import 'dotenv/config'

export default new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        logging: false,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres'
    }
);