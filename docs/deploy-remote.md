# Deploy Cepat di Mesin Baru

Panduan ini dibuat untuk skenario Anda: laptop baru, minim instalasi, dan ingin sesederhana mungkin.

## Kebutuhan minimum

Install hanya ini:

1. `git`
2. `docker`
3. `docker compose`

Tidak perlu install `node`, `npm`, atau dependency lain di host kalau memakai cara Docker.

## Langkah 1: clone project

```bash
git clone <repo-anda>
cd iris-remote-organizer-bot
```

## Langkah 2: buat env

```bash
cp .env.remote.example .env
```

Lalu edit `.env` dan isi minimal:

1. `WHATSAPP_ALLOWED_NUMBERS`
2. `BOT_API_TOKEN`
3. `IRIS_BASE_URL`
4. `IRIS_API_TOKEN`

## Langkah 3: cek koneksi ke IRIS

```bash
./scripts/check-iris.sh
```

Kalau benar, Anda akan mendapat JSON intent dari server IRIS.

## Langkah 4: jalankan bot

```bash
./scripts/setup.sh
```

Kalau `.env` sudah ada, script ini akan:

1. membuat folder runtime
2. build image docker
3. menyalakan container

## Langkah 5: scan QR

Lihat QR:

```bash
./scripts/show-qr.sh
```

Kalau QR belum muncul:

```bash
./scripts/logs.sh
```

Scan QR dengan WhatsApp yang akan dipakai bot.

## Setelah aktif

Perintah harian:

```bash
./scripts/start.sh
./scripts/stop.sh
./scripts/logs.sh
./scripts/show-qr.sh
```

## Cara pakai dari WhatsApp

Contoh perintah:

```text
help
catat: nomor resi paket 123456
cari: kontrak april
kirim: 1
batal
```

Kalau Anda kirim file tanpa caption, bot akan bertanya dulu apakah file itu mau disimpan dan mau diberi nama apa.

## Struktur data di mesin remote

Semua data penting ada di folder `runtime`:

1. `runtime/session`
2. `runtime/storage`
3. `runtime/state`
4. `runtime/logs`

Artinya kalau suatu hari ingin pindah mesin tanpa scan ulang, secara teori Anda bisa ikut memindahkan folder `runtime/session`, walau untuk praktik paling aman tetap siap scan QR lagi.

## Jika IRIS ada di server publik

Kalau server IRIS bisa diakses lewat internet publik:

1. gunakan HTTPS
2. lindungi endpoint dengan token kuat
3. kalau bisa allowlist IP dari mesin bot
4. jangan expose endpoint internal lain yang tidak diperlukan
