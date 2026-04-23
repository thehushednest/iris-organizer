# Desktop App dan Build `.exe`

Project ini sekarang mempunyai wrapper desktop berbasis Electron agar kolega non-teknis tidak perlu:

1. edit `.env`
2. membuka terminal
3. menghafal script

## Fitur UI

Aplikasi desktop menyediakan:

1. form konfigurasi bot
2. impor template konfigurasi
3. ekspor template konfigurasi
4. tombol `Simpan`
5. tombol `Jalankan Bot`
6. tombol `Hentikan`
7. tampilan QR WhatsApp
8. tampilan log
9. tombol buka folder arsip, runtime, dan log

Semua setting disimpan otomatis di profil user Windows.

## Jalankan saat development

```bash
npm install
npm run desktop
```

## Build Windows `.exe`

```bash
npm install
npm run dist:win
```

Jika Anda sudah punya ikon Windows final, simpan dulu sebagai:

```text
desktop/assets/icon.ico
```

Build akan otomatis memakainya.

Output akan berada di folder:

```text
dist-electron/
```

Target yang dibuat:

1. `IRIS-Remote-Organizer-Portable-<version>-x64.exe`
2. `IRIS-Remote-Organizer-Setup-<version>-x64.exe`

Biasanya file yang relevan untuk dibagikan adalah:

1. file `.exe` portable
2. file installer `.exe` dari NSIS

Untuk kolega non-teknis, yang paling sederhana biasanya:

1. bagikan installer NSIS jika ingin proses instal biasa
2. bagikan versi portable jika ingin cukup klik satu file tanpa instalasi formal

## Siapkan Paket Rilis

Setelah build berhasil:

```bash
npm run release:package
```

Script ini akan membuat folder:

```text
release-package/
```

Isi paket rilis:

1. file `.exe` hasil build
2. dokumen instalasi singkat
3. `assets/release-template.example.json` untuk impor konfigurasi awal
4. `assets/.env.remote.example` untuk referensi administrator

## Alur pakai kolega

1. buka aplikasi
2. klik `Impor Template` jika Anda menyediakan file konfigurasi JSON
3. klik `Simpan`
4. klik `Cek Koneksi IRIS`
5. klik `Jalankan Bot`
6. scan QR
7. selesai

## Catatan penting

- Build `.exe` paling stabil dilakukan di Windows.
- Saat pertama kali `npm install`, Electron dan builder akan mengunduh dependency tambahan.
- Engine bot tetap sama dengan mode CLI, jadi perilaku WhatsApp dan organizer tetap konsisten.

## Rekomendasi distribusi tim

Kalau tujuannya dibagikan ke banyak kolega:

1. siapkan satu mesin build Windows
2. jalankan `npm install`
3. jalankan `npm run dist:win`
4. ambil hasil dari `dist-electron/`
5. bagikan file `.exe` yang dipilih ke kolega

Kolega tidak perlu clone repo kalau Anda membagikan hasil `.exe`.
