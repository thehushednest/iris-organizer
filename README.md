# IRIS Remote Organizer Bot

Project baru yang berdiri sendiri untuk membantu mengorganisir dokumen lewat WhatsApp.

Sekarang project ini punya dua mode:

1. mode engine/CLI untuk developer atau server
2. mode desktop app untuk dibungkus menjadi `.exe` agar kolega non-teknis cukup memakai UI

Bot ini didesain untuk skenario Anda:

- bot berjalan di mesin remote yang jauh secara fisik
- file disimpan ke folder lokal di mesin remote itu
- pairing WhatsApp dilakukan langsung di mesin remote lewat QR
- pemahaman bahasa natural tidak lokal, tetapi meminta keputusan intent ke project IRIS lewat IP

Jadi pembagian tugasnya jelas:

1. `iris-remote-organizer-bot`
   Menangani WhatsApp, download file, simpan arsip, pencarian lokal, dan kirim ulang dokumen.
2. `IRIS Project`
   Menjadi otak yang memutuskan intent percakapan secara natural melalui endpoint HTTP internal.

## Arsitektur

Flow untuk file masuk:

1. user mengirim file ke WhatsApp bot
2. bot di mesin remote menerima dan mengunduh file
3. kalau konteks belum jelas, bot bertanya apakah file ingin disimpan
4. ketika user menjawab, bot meminta keputusan intent ke IRIS lewat IP
5. file dipindahkan ke folder arsip lokal yang rapi
6. metadata disimpan dalam JSON lokal

Flow untuk pencarian:

1. user menulis permintaan seperti `cari: kontrak april`
2. bot mencari index dokumen lokal di mesin remote
3. bot menampilkan hasil
4. user menulis `kirim 1`
5. bot mengirim file yang dimaksud kembali ke WhatsApp

## Struktur penyimpanan

- `runtime/storage`
  Arsip final di mesin remote.
- `runtime/state/documents.json`
  Metadata semua dokumen.
- `runtime/state/conversations.json`
  State percakapan dan pending action.
- `runtime/session`
  Session WhatsApp hasil scan QR.
- `runtime/logs/latest-qr.txt`
  QR terbaru untuk pairing.

## Setup

Cara paling sederhana di laptop baru:

1. install `git` dan `docker` + `docker compose`
2. clone repo
3. masuk ke folder `iris-remote-organizer-bot`
4. jalankan:

```bash
./scripts/setup.sh
```

Jika `.env` belum ada, script itu akan membuat `.env` dari template lalu berhenti. Setelah itu:

1. edit `.env`
2. isi `IRIS_BASE_URL`, `IRIS_DECIDE_PATH`, `IRIS_API_TOKEN`
3. isi `WHATSAPP_ALLOWED_NUMBERS`
4. jalankan lagi:

```bash
./scripts/setup.sh
```

Saat pertama kali jalan:

1. terminal akan menampilkan QR
2. scan QR dengan WhatsApp yang dipakai bot
3. session tersimpan di `runtime/session`

Kalau mau jalan manual tanpa helper script:

```bash
docker compose up -d --build
```

Perintah harian:

```bash
./scripts/start.sh
./scripts/stop.sh
./scripts/logs.sh
./scripts/show-qr.sh
./scripts/check-iris.sh
./scripts/install-user-service.sh
```

Mode non-Docker masih bisa dipakai kalau diperlukan:

```bash
npm install
npm start
```

Mode desktop untuk pengemasan `.exe`:

```bash
npm install
npm run desktop
```

Build Windows:

```bash
npm install
npm run dist:win
npm run release:package
```

## Perintah khusus

- `help`
- `catat: isi catatan`
- `cari: kata kunci`
- `kirim: nomor hasil`
- `batal`

Kalau user tidak menulis perintah khusus, bot tetap mencoba memahami maksud lewat IRIS.

## Endpoint lokal bot

- `GET /health`
- `GET /qr`
- `GET /documents/search?q=...`

Endpoint selain `/health` membutuhkan:

```http
Authorization: Bearer <BOT_API_TOKEN>
```

## Kontrak ke IRIS

Bot ini mengharapkan IRIS menyediakan endpoint POST internal seperti:

- `POST /api/internal/organizer/decide`

Body contoh:

```json
{
  "text": "tolong cari kontrak april",
  "hasMedia": false,
  "pendingAction": null,
  "lastSearchResults": []
}
```

Response contoh:

```json
{
  "intent": "search_documents",
  "reply": "Baik, saya carikan dulu.",
  "searchQuery": "kontrak april"
}
```

Bot mengirim `supportedActions` ke IRIS di setiap request. IRIS sebaiknya memilih salah satu aksi aman tersebut, misalnya `list_documents`, `search_documents`, `send_file`, `save_text`, `ask_general_info`, `help`, `cancel`, atau `clarify`.

Detail contract lengkap ada di `docs/iris-api-contract.md`.

## Catatan penting

- Project ini sengaja dibuat terpisah supaya tidak mengganggu bot WhatsApp lain atau app lain di workspace.
- Kalau koneksi ke IRIS terputus, bot bisa fallback ke heuristic sederhana jika `IRIS_FALLBACK_ENABLED=true`.
- Untuk produksi jangka panjang, sebaiknya endpoint IRIS di-protect dengan token internal dan dibatasi hanya dari IP bot.

## Dipakai Banyak Kolega

Project ini bisa dicopy ke banyak kolega dengan pola yang sama:

1. setiap kolega clone repo ini ke laptopnya sendiri
2. setiap kolega punya file `.env` sendiri
3. setiap kolega scan QR WhatsApp miliknya sendiri
4. semua kolega bisa tetap memakai server IRIS yang sama sebagai otak

Yang biasanya berbeda per kolega:

1. `BOT_NAME`
2. `BOT_OWNER_TITLE`
3. `WHATSAPP_ALLOWED_NUMBERS`
4. `BOT_API_TOKEN`
5. `BOT_HTTP_PORT` jika perlu

## Rekomendasi untuk mesin baru

Supaya mesin baru sesederhana mungkin, saya sarankan kebutuhan minimumnya hanya:

1. `git`
2. `docker`
3. koneksi internet

Dengan begitu Anda tidak perlu mengurus instalasi `node`, package global, atau dependency lain di host. Semua runtime bot akan jalan di container.

Panduan deploy singkat untuk mesin baru ada di [docs/deploy-remote.md](./docs/deploy-remote.md).
Template env yang lebih siap untuk skenario mesin remote ada di [.env.remote.example](./.env.remote.example).
Versi sangat singkat ada di [INSTALL-1PAGE.md](./INSTALL-1PAGE.md).
Panduan rollout ke beberapa kolega ada di [docs/rollout-colleagues.md](./docs/rollout-colleagues.md).
Panduan aplikasi desktop dan build `.exe` ada di [docs/desktop-exe.md](./docs/desktop-exe.md).
Panduan mesin build Windows ada di [docs/build-windows-machine.md](./docs/build-windows-machine.md).
Panduan distribusi hasil `.exe` ke kolega ada di [docs/distribute-to-colleagues.md](./docs/distribute-to-colleagues.md).
Panduan branding dan ikon ada di [docs/branding-and-icon.md](./docs/branding-and-icon.md).
Checklist final go-live ada di [docs/go-live-checklist.md](./docs/go-live-checklist.md).
