# Go-Live Checklist

Checklist ini dibuat untuk tahap terakhir sebelum aplikasi benar-benar dibuild dan dibagikan ke kolega.

## A. Persiapan Server IRIS

Pastikan server IRIS utama sudah siap:

1. endpoint `POST /api/internal/organizer/decide` sudah aktif
2. `INTERNAL_API_TOKEN` sudah diatur
3. server IRIS bisa diakses dari laptop kolega atau dari mesin pengujian
4. model `iris-nano` di server IRIS berfungsi

## B. Persiapan Mesin Build Windows

Di mesin build Windows, pastikan sudah ada:

1. Git
2. Node.js 20 LTS
3. npm

## C. Persiapan Project

```bash
git clone <repo-anda>
cd iris-remote-organizer-bot
npm install
```

## D. Pengujian Desktop App Sebelum Build

Jalankan:

```bash
npm run desktop
```

Lalu cek hal berikut:

1. aplikasi terbuka normal
2. field konfigurasi bisa diisi dan disimpan
3. tombol `Ekspor Template` berfungsi
4. tombol `Impor Template` berfungsi
5. tombol `Cek Koneksi IRIS` berhasil memberi respons
6. tombol `Jalankan Bot` bisa memunculkan QR
7. log tampil normal

## E. Branding Final

Opsional tetapi disarankan:

1. siapkan file `desktop/assets/icon.ico`
2. cek logo tampil baik di UI
3. pastikan nama produk sudah final

## F. Build Windows

```bash
npm run dist:win
```

Setelah itu cek folder:

```text
dist-electron/
```

Pastikan file `.exe` berhasil dibuat.

## G. Siapkan Paket Distribusi

```bash
npm run release:package
```

Setelah itu cek folder:

```text
release-package/
```

Minimal pastikan ada:

1. file `.exe` installer atau portable
2. `docs/INSTALL-1PAGE.md`
3. `README-RELEASE.txt`

## H. Siapkan Template untuk Kolega

Sebelum membagikan ke kolega, sebaiknya:

1. buka desktop app
2. isi konfigurasi dasar yang benar
3. klik `Ekspor Template`
4. simpan file `.json`

Dengan begitu kolega tinggal impor template itu.

## I. Paket yang Dibagikan ke Kolega

Untuk tiap kolega, biasanya cukup kirim:

1. file `.exe`
2. file template konfigurasi `.json`
3. instruksi singkat 5 langkah

## J. Uji Kolega Pertama

Sebelum dibagikan luas, lakukan uji ke 1 kolega dulu:

1. install / buka `.exe`
2. impor template konfigurasi
3. cek koneksi IRIS
4. jalankan bot
5. scan QR
6. kirim file dan catatan percobaan
7. cari dan kirim ulang file

## K. Tanda Siap Go-Live

Project dianggap siap go-live jika:

1. desktop app stabil
2. koneksi IRIS stabil
3. QR bisa dipair
4. file bisa disimpan
5. file bisa dicari
6. file bisa dikirim ulang
7. paket `.exe` berhasil dibagikan dan dipakai minimal oleh 1 kolega percobaan
