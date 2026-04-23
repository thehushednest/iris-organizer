# Branding dan Ikon

Project ini sekarang sudah mempunyai identitas visual dasar:

1. logo SVG aplikasi di `desktop/assets/logo.svg`
2. nama produk `IRIS Remote Organizer`
3. warna utama hijau tua + krem + emas

## Tujuan branding saat ini

Branding dibuat supaya aplikasi:

1. terasa lebih profesional saat dipakai kolega
2. mudah dibedakan dari tool teknis lain
3. konsisten antara UI desktop dan hasil build

## Asset yang sudah ada

- `desktop/assets/logo.svg`

Logo ini dipakai di tampilan aplikasi desktop.

## Untuk ikon `.exe` Windows

Build Windows paling ideal memakai file `.ico`.

Saat ini project belum menyertakan file `.ico` final, tetapi konfigurasi build sudah siap memakainya secara otomatis jika file itu ada. Jadi rekomendasi saya:

1. gunakan logo SVG yang sudah ada sebagai dasar
2. konversi ke `icon.ico` di mesin build Windows
3. simpan hasilnya, misalnya di `desktop/assets/icon.ico`
4. jalankan build seperti biasa

Catatan teknis:

- konfigurasi Electron sekarang memakai file [electron-builder.config.cjs](../electron-builder.config.cjs)
- jika `desktop/assets/icon.ico` ada, build Windows akan otomatis memakainya
- jika file itu belum ada, build tetap berjalan dengan ikon default

## Arah visual

Identitas yang dipakai sekarang:

1. serius dan profesional
2. bukan gaya dashboard AI generik
3. cocok untuk penggunaan kerja internal dan dokumentasi

## Jika nanti ingin saya lanjutkan

Peningkatan branding berikutnya yang paling masuk akal:

1. buat ikon `.ico` final untuk build Windows
2. buat splash/loading state yang lebih branded
3. buat mode warna lembaga atau per-divisi bila diperlukan
