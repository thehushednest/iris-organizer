# Rollout untuk Beberapa Kolega

Project ini bisa dibagikan ke banyak kolega dengan pola sederhana:

1. setiap kolega clone project ini ke laptopnya sendiri
2. setiap kolega mengisi `.env` miliknya sendiri
3. setiap kolega scan QR WhatsApp miliknya sendiri
4. semua kolega boleh memakai server IRIS yang sama sebagai otak

## Yang unik per kolega

Setiap kolega sebaiknya mengganti:

1. `BOT_NAME`
2. `WHATSAPP_ALLOWED_NUMBERS`
3. `BOT_API_TOKEN`
4. `BOT_HTTP_PORT` jika perlu
5. isi folder `runtime` miliknya sendiri

## Contoh

### Kolega A

```env
BOT_NAME=IRIS Organizer - Andi
WHATSAPP_ALLOWED_NUMBERS=6281111111111
BOT_HTTP_PORT=8031
```

### Kolega B

```env
BOT_NAME=IRIS Organizer - Budi
WHATSAPP_ALLOWED_NUMBERS=6282222222222
BOT_HTTP_PORT=8032
```

## Rekomendasi distribusi

Paling sederhana:

1. simpan project ini di satu repo
2. setiap kolega clone sendiri
3. gunakan `.env.remote.example` sebagai template
4. jangan commit file `.env`
5. jangan commit folder `runtime`

## Kalau semua kolega memakai server IRIS yang sama

Itu tetap aman selama:

1. endpoint internal organizer memakai token
2. server IRIS cukup kuat menangani permintaan
3. jika perlu, Anda bisa membuat token khusus per kolega di reverse proxy atau gateway

## Kalau ingin branding per kolega

Anda tinggal ubah:

1. `BOT_NAME`
2. `BOT_OWNER_TITLE`

Tanpa perlu mengubah kode.
