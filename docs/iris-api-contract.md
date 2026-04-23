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
  "supportedActions": [
    {
      "intent": "list_documents",
      "description": "Tampilkan daftar dokumen lokal yang sudah tersimpan."
    },
    {
      "intent": "search_documents",
      "description": "Cari dokumen lokal berdasarkan topik, judul, kategori, tag, atau nama file.",
      "fields": ["searchQuery"]
    },
    {
      "intent": "ask_general_info",
      "description": "Jawab pertanyaan umum atau informasi eksternal melalui IRIS, tanpa mencari file lokal.",
      "fields": ["reply"]
    }
  ],
  "localContext": {
    "storedDocumentCount": 12,
    "canBrowseExternally": true
  },
  "intentGuidance": [
    "Pilih tepat satu intent dari supportedActions.",
    "Jika user meminta daftar/list dokumen, gunakan list_documents walaupun ada kata kirim/kirimkan."
  ],
  "intentExamples": [
    {
      "id": "send-list-not-file",
      "context": "Kata kirim digunakan untuk meminta daftar, bukan mengirim file.",
      "userText": "coba kirim list dokumen yang saya punya",
      "decision": {
        "intent": "list_documents"
      },
      "note": "Jangan pilih send_file jika object yang dikirim adalah list/daftar."
    }
  ],
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
- `supportedActions`
  Daftar aksi aman yang bisa dieksekusi bot lokal. IRIS sebaiknya memilih salah satu intent dari daftar ini.
- `localContext`
  Konteks kemampuan bot lokal, jumlah dokumen tersimpan, dan pemisahan antara arsip lokal vs informasi umum.
- `intentGuidance`
  Aturan ringkas human-centered agar IRIS memilih intent dengan aman dan konsisten.
- `intentExamples`
  Contoh RAG percakapan paling relevan untuk pesan saat ini. IRIS sebaiknya meniru pola `decision` contoh ketika konteksnya mirip.

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
- `list_documents`
- `search_documents`
- `send_file`
- `ask_general_info`
- `help`
- `cancel`
- `clarify`

Alias lama tetap ditoleransi oleh bot lokal:

- `search` diperlakukan sebagai `search_documents`
- `chat`, `general_info`, `web_search`, dan `browse_web` diperlakukan sebagai `ask_general_info`
- `list`, `browse_documents`, dan `show_documents` diperlakukan sebagai `list_documents`

## Peran IRIS

IRIS tidak perlu menyimpan file organizer. Semua file tetap tinggal di mesin bot.

IRIS bertugas:

1. memahami maksud user
2. menyarankan judul file atau kategori
3. mengubah percakapan natural menjadi keputusan intent yang terstruktur
4. menjawab pertanyaan umum/terkini jika user tidak sedang meminta arsip lokal

Bot lokal tetap menjadi executor aman:

1. menyimpan file di laptop
2. mencari arsip lokal
3. mengirim file yang dipilih
4. menolak aksi yang tidak ada di kontrak

## Rekomendasi implementasi di IRIS

- Buat route handler internal yang memanggil model `iris nano`
- Format output model harus dipaksa JSON
- Tambahkan system prompt khusus organizer
- Validasi `intent` sebelum response dikirim ke bot
- Lindungi endpoint dengan token internal dan allowlist IP bot jika memungkinkan
- Untuk pertanyaan informasi umum/terkini, IRIS boleh melakukan browsing/tooling di sisi IRIS lalu mengembalikan `ask_general_info` dengan `reply`.
