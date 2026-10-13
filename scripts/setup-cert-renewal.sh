#!/bin/bash
# One-time setup on the PROD server (run with sudo from the repo root):
#   sudo bash scripts/setup-cert-renewal.sh
#
# 1. Rebuilds the frontend so nginx serves ACME challenges from /var/www/certbot
# 2. Force-renews the (expired) Let's Encrypt certs via webroot — no downtime
# 3. Installs a deploy hook so future auto-renewals reload nginx in the container
# 4. Verifies the auto-renewal timer and does a dry run
set -e

cd "$(dirname "$0")/.."

echo "── 1/5 Webroot dir + rebuild frontend (nginx with ACME location) ──"
mkdir -p /var/www/certbot
docker compose up --build -d frontend
sleep 3

echo "── 2/5 Force-renew certificates via webroot ──"
certbot certonly --webroot -w /var/www/certbot --cert-name refsale.ru     -d refsale.ru -d www.refsale.ru --force-renewal --non-interactive
certbot certonly --webroot -w /var/www/certbot --cert-name onecooperative.ru \
    -d onecooperative.ru -d www.onecooperative.ru --force-renewal --non-interactive || echo "!! onecooperative.ru failed (DNS?) — continuing"

echo "── 3/5 Deploy hook: reload nginx after every future renewal ──"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
docker exec "$(docker ps -qf name=refsale-frontend | head -1)" nginx -s reload
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "── 4/5 Reload nginx with the fresh certs ──"
docker exec "$(docker ps -qf name=refsale-frontend | head -1)" nginx -s reload

echo "── 5/5 Auto-renewal timer check + dry run ──"
if systemctl list-timers 2>/dev/null | grep -qi certbot; then
    echo "certbot timer: OK (systemd)"
elif [ -f /etc/cron.d/certbot ] || crontab -l 2>/dev/null | grep -q certbot; then
    echo "certbot cron: OK"
else
    echo "No certbot timer found — installing cron fallback (daily 03:17)"
    echo "17 3 * * * root certbot renew -q" > /etc/cron.d/certbot-renew
fi
certbot renew --dry-run

echo ""
echo "✅ Done. Check: https://refsale.ru"
echo | openssl s_client -connect localhost:443 -servername refsale.ru 2>/dev/null | openssl x509 -noout -dates || true
