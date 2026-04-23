# Setup Ikon Windows

Project ini sudah siap memakai ikon `.ico` untuk hasil build Windows.

## Yang perlu dilakukan

Simpan file ikon Windows final dengan nama:

```text
desktop/assets/icon.ico
```

## Setelah file itu ada

Jalankan build seperti biasa:

```bash
npm run dist:win
```

Konfigurasi `electron-builder` akan otomatis memakai ikon itu.

## Jika ikon belum ada

Build tetap bisa jalan. Aplikasi akan memakai ikon default Electron.

## Saran spesifikasi ikon

Gunakan file `.ico` yang memuat ukuran:

1. 256x256
2. 128x128
3. 64x64
4. 48x48
5. 32x32
6. 16x16

Supaya tampil bagus di:

1. file explorer
2. taskbar
3. installer
4. shortcut desktop
