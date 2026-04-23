# Distribusi ke Kolega

Dokumen ini fokus ke tahap setelah file `.exe` sudah jadi.

## Pilihan file yang dibagikan

### Opsi 1: Installer biasa

Bagikan:

1. `IRIS-Remote-Organizer-Setup-<version>-x64.exe`

Cocok untuk:

1. kolega umum
2. pengguna non-teknis
3. skenario instalasi normal di Windows

### Opsi 2: Portable

Bagikan:

1. `IRIS-Remote-Organizer-Portable-<version>-x64.exe`

Cocok untuk:

1. pengguna yang tidak ingin proses instal formal
2. pengujian cepat
3. penggunaan dari folder biasa

## Apa yang perlu Anda kirim ke kolega

Minimal kirim:

1. file `.exe`
2. 3 informasi konfigurasi

Atau yang lebih nyaman:

1. file `.exe`
2. file template konfigurasi `.json` hasil ekspor dari aplikasi atau `assets/release-template.example.json` yang sudah Anda sesuaikan

Informasi yang wajib mereka isi di aplikasi:

1. `IP / URL Server IRIS`
2. `Token Internal IRIS`
3. `Nomor WhatsApp Diizinkan`
4. `Port API Lokal Bot`, gunakan `8031` jika `8030` dipakai aplikasi lain

Opsional:

1. `Nama Bot`
2. `Sapaan Pengguna`

## Teks instruksi singkat yang bisa Anda copy ke kolega

```text
1. Buka aplikasi IRIS Remote Organizer.
2. Klik Impor Template jika saya sudah mengirimkan file konfigurasi.
3. Klik Cek Koneksi IRIS.
4. Klik Jalankan Bot.
5. Scan QR WhatsApp yang muncul.
6. Selesai.
```

## Cara Anda menyiapkan template untuk kolega

1. buka aplikasi desktop di mesin Anda
2. isi konfigurasi dasar untuk kolega tersebut
3. klik `Ekspor Template`
4. simpan file `.json`
5. kirim file `.json` itu bersama file `.exe` ke kolega

Dengan cara ini, kolega tidak perlu mengisi semua field dari nol.

## Jika ada masalah umum

### Aplikasi tidak bisa konek ke IRIS

Cek:

1. URL server IRIS benar
2. token internal benar
3. server IRIS bisa diakses dari laptop kolega

### QR tidak muncul

Cek:

1. koneksi internet aktif
2. tombol Jalankan Bot sudah ditekan
3. lihat tab log di aplikasi

### Bot tidak merespons chat

Cek:

1. nomor WhatsApp kolega sudah masuk ke `Nomor WhatsApp Diizinkan`
2. QR sudah benar-benar terscan
3. status di aplikasi sudah running / connected
