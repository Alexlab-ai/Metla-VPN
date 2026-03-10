#!/bin/bash

# chmod ugo+x install.sh

sudo apt-get update -y && sudo apt-get upgrade -y

# INSTALL NODEJS
echo "Установка curl..."
sudo apt install -y curl

echo "Установка NVM..."
sudo curl -o- https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash
source ~/.bashrc
nvm install 24.12.0
# Устанавливаем как версию по умолчанию
nvm alias default 24.12.0
nvm use default
node -v

echo "Установка завершена!"
# INSTALL NODEJS

npm i
npm install pm2 -g
npm install nodemon -g
pm2 install pm2-logrotate
# 
sudo apt-get install nano
sudo apt-get install cron
CRON_JOB="@reboot pm2 resurrect"
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
echo "Задача добавлена: $CRON_JOB"
# sudo crontab -e
# @reboot pm2 resurrect

# INSTALL POSTGRESQL
sudo apt install postgresql postgresql-client
sudo systemctl enable postgresql.service && sudo systemctl start postgresql.service
sudo netstat -tunlp | grep 5432
sudo psql --version
su - postgres -c "psql -c 'CREATE USER tgvpnbot WITH PASSWORD 'Y21cNk42AAlr'; CREATE DATABASE tgvpnbot; GRANT ALL PRIVILEGES ON DATABASE tgvpnbot TO tgvpnbot; GRANT ALL ON SCHEMA public TO tgvpnbot; ALTER DATABASE tgvpnbot OWNER TO tgvpnbot;'"
su - postgres -c "psql -c 'SHOW config_file;'"
echo "Установка завершена. Перезагрузите терминал"
# sudo su - postgres
# СОЗДАНИЕ ЮСЕРА И БАЗЫ ДАННЫХ
# su - postgres
# psql
# CREATE USER tgvpnbot WITH PASSWORD 'Y2_1cNk42:AAlr'; CREATE DATABASE tgvpnbot; GRANT ALL PRIVILEGES ON DATABASE tgvpnbot TO tgvpnbot; GRANT ALL ON SCHEMA public TO tgvpnbot; ALTER DATABASE tgvpnbot OWNER TO tgvpnbot;
# REMOTE ACCESS
# su - postgres -c "psql -c 'SHOW config_file;'"
# listen_addresses = '*'
# nano /etc/postgresql/14/main/pg_hba.conf
# host all all 0.0.0.0/0 md5
# systemctl restart postgresql
# INSTALL POSTGRESQL