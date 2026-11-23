#!/usr/bin/env bash
# Oracle Cloud Always Free — LAMP bootstrap for the SPS attendance PHP site
# Target: Ubuntu 22.04/24.04 on an Oracle Always Free VM.
# Works on BOTH shapes:
#   - VM.Standard.A1.Flex (Ampere ARM, aarch64) — 4 OCPU / 24 GB Always Free
#   - VM.Standard.E2.1.Micro (AMD, x86_64)    — 1 OCPU / 1 GB  Always Free (x2)
# The Ampere A1 capacity is frequently "Out of host capacity" in Mumbai, so this
# script is tuned for the 1 GB AMD micro: it adds 2 GB swap and trims MySQL/PHP.
# Run ONCE on a fresh instance as the 'ubuntu' user:
#   scp deploy/oracle-bootstrap.sh ubuntu@<VM_IP>:~/
#   ssh ubuntu@<VM_IP> 'bash ~/oracle-bootstrap.sh'
set -euo pipefail

# ---- EDIT THESE BEFORE RUNNING ----
DOMAIN="attendance.spscsialkot.com"
DB_NAME="attendance"
DB_USER="attendance_user"
DB_PASS="CHANGE_ME_STRONG_PASSWORD"
APP_ROOT="/var/www/$DOMAIN"
# ----------------------------------

echo "==> Updating packages"
sudo apt-get update -y
sudo apt-get upgrade -y

# ---- Swap (required on the 1 GB AMD micro shape) ----
echo "==> Creating 2 GB swap (skip if already present)"
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  # keep swap usage low
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-sps-swap.conf >/dev/null
  sudo sysctl -p /etc/sysctl.d/99-sps-swap.conf
fi

echo "==> Installing Apache + PHP + MySQL"
sudo apt-get install -y apache2 mysql-server \
  php php-cli php-common php-mysql php-gd php-mbstring php-curl \
  php-xml php-zip php-intl php-fileinfo php-bcmath libapache2-mod-php \
  unzip curl git certbot python3-certbot-apache

echo "==> Enabling Apache modules"
sudo a2enmod rewrite headers ssl
sudo systemctl enable --now apache2 mysql

# ---- MySQL tuning for 1 GB RAM ----
echo "==> Tuning MySQL for low memory"
sudo tee /etc/mysql/mysql.conf.d/99-sps-tuning.cnf >/dev/null <<'MYSQLTUNE'
[mysqld]
innodb_buffer_pool_size = 128M
innodb_log_file_size    = 32M
performance_schema      = off
max_connections         = 30
tmp_table_size          = 16M
max_heap_table_size     = 16M
key_buffer_size         = 8M
MYSQLTUNE
sudo systemctl restart mysql

echo "==> Tuning PHP for uploads/reports"
PHP_INI=$(php -r 'echo php_ini_loaded_file();')
sudo sed -i 's/^upload_max_filesize.*/upload_max_filesize = 64M/' "$PHP_INI"
sudo sed -i 's/^post_max_size.*/post_max_size = 64M/' "$PHP_INI"
sudo sed -i 's/^max_execution_time.*/max_execution_time = 300/' "$PHP_INI"
sudo sed -i 's/^memory_limit.*/memory_limit = 128M/' "$PHP_INI"
sudo systemctl restart apache2

echo "==> Creating MySQL database + user"
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> Creating app root + Apache vhost"
sudo mkdir -p "$APP_ROOT"
sudo chown -R www-data:www-data "$APP_ROOT"
sudo chmod -R 755 "$APP_ROOT"

sudo tee /etc/apache2/sites-available/$DOMAIN.conf >/dev/null <<VHOST
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot $APP_ROOT
    <Directory $APP_ROOT>
        AllowOverride All
        Require all granted
    </Directory>
    ErrorLog \${APACHE_LOG_DIR}/$DOMAIN-error.log
    CustomLog \${APACHE_LOG_DIR}/$DOMAIN-access.log combined
</VirtualHost>
VHOST

sudo a2ensite $DOMAIN.conf
sudo a2dissite 000-default.conf 2>/dev/null || true
sudo systemctl reload apache2

echo "==> Configuring UFW firewall"
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full'
sudo ufw --force enable

echo "==> Oracle Cloud: ALSO open ports 80/443 in the OCI Security List (console)!"
echo "    Networking -> VCN -> Security Lists -> Ingress Rules: add 0.0.0.0/0 tcp 80 and 443."

echo "==> Done. Next steps:"
echo "  1. Upload site files to $APP_ROOT (scp/rsync)."
echo "  2. Import your DB dump:  mysql -u $DB_USER -p $DB_NAME < dump.sql"
echo "  3. Update config.php with DB credentials above."
echo "  4. Point DNS A record for $DOMAIN to this VM's public IP."
echo "  5. Issue SSL:  sudo certbot --apache -d $DOMAIN"
echo "  6. chmod 775 $APP_ROOT/uploads $APP_ROOT/downloads"