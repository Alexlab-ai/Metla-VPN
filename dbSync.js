import sequelize from './dbPostgres.js'
import * as Models from "./dbModels.js";

try
{
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });

    console.log('UPDATED');
}
catch(Err)
{
    console.log(Err);
    process.exit();
}

process.exit();