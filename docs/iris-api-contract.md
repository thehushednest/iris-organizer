# Kontrak API IRIS untuk Organizer Bot

Bot organizer ini tidak memanggil Ollama langsung. Ia memanggil project IRIS Anda lewat HTTP internal agar seluruh kecerdasan natural tetap terpusat di IRIS.

## Endpoint

- Method: `POST`
- Path default: `/api/internal/organizer/decide`
- Auth: `Authorization: Bearer <IRIS_API_TOKEN>`

## Request body

```json
{
  "text": "file ini tolong simpan sebagai kontrak vendor april",
  "hasMedia": true,
  "mode": "pending_media_confirmation",
  "pendingAction": {
    "type": "media_save_confirmation"
  },
  "lastSearchResults": [
    {
      "id": "doc-123",
      "title": "Kontrak Vendor April",
      "category": "kontrak"
    }
  ]
}
```

Field penting:

- `text`
  Isi pesan user.
- `hasMedia`
  Menandakan ada lampiran media/file.
- `mode`
  Konteks tambahan, misalnya `pending_media_confirmation`.
- `pendingAction`
  State percakapan yang sedang berjalan.
- `lastSearchResults`
  Ringkasan hasil pencarian terakhir agar IRIS bisa memahami rujukan seperti "kirim nomor 2".

## Response body

IRIS harus mengembalikan JSON dengan format berikut:

```json
{
  "intent": "save_text",
  "reply": "Catatan ini saya simpan sebagai file teks.",
  "title": "Catatan meeting vendor april",
  "category": "catatan",
  "tags": ["vendor", "april"],
  "searchQuery": null,
  "reference": null
}
```

## Nilai `intent` yang didukung

- `save_text`
- `save_media`
- `search`
- `send_file`
- `help`
- `cancel`
- `clarify`
- `chat`

## Peran IRIS

IRIS tidak perlu menyimpan file organizer. Semua file tetap tinggal di mesin bot.

IRIS hanya bertugas:

1. memahami maksud user
2. menyarankan judul file atau kategori
3. mengubah percakapan natural menjadi keputusan intent yang terstruktur

## Rekomendasi implementasi di IRIS

- Buat route handler internal yang memanggil model `iris nano`
- Format output model harus dipaksa JSON
- Tambahkan system prompt khusus organizer
- Validasi `intent` sebelum response dikirim ke bot
- Lindungi endpoint dengan token internal dan allowlist IP bot jika memungkinkan
