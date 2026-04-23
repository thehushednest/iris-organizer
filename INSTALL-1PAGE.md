# Install Singkat

## Kebutuhan

1. `git`
2. `docker`
3. `docker compose`

## Langkah

```bash
git clone <repo-anda>
cd iris-remote-organizer-bot
cp .env.remote.example .env
```

Edit `.env`, isi minimal:

```env
BOT_NAME=IRIS Organizer - Nama Anda
BOT_OWNER_TITLE=Bapak
WHATSAPP_ALLOWED_NUMBERS=628xxxxxxxxxx
WHATSAPP_BLOCKED_NUMBERS=
BOT_API_TOKEN=token_bot_lokal
IRIS_BASE_URL=http://IP-SERVER-IRIS:3000
IRIS_API_TOKEN=internal_api_token_iris
```

Tes koneksi ke IRIS:

```bash
./scripts/check-iris.sh
```

Jalankan bot:

```bash
./scripts/setup.sh
```

Tampilkan QR:

```bash
./scripts/show-qr.sh
```

Lihat log:

```bash
./scripts/logs.sh
```

## Perintah WhatsApp

```text
help
catat: isi catatan
cari: kata kunci
kirim: 1
batal
```
