# Build Machine Windows

Panduan ini ditujukan untuk Anda sebagai pembuat paket `.exe`.

## Tujuan

Mesin ini dipakai untuk:

1. install dependency project
2. menjalankan desktop app saat testing
3. build file `.exe`
4. menyiapkan paket rilis yang siap dibagikan ke kolega

## Kebutuhan minimum di mesin build

Install:

1. Git
2. Node.js 20 LTS
3. npm

Tidak wajib install Docker untuk tahap build `.exe`.

## Langkah build

### 1. Clone project

```bash
git clone <repo-anda>
cd iris-remote-organizer-bot
```

### 2. Install dependency

```bash
npm install
```

### 3. Test desktop app

```bash
npm run desktop
```

Yang dicek:

1. UI terbuka normal
2. tombol simpan berfungsi
3. tombol cek koneksi IRIS berfungsi
4. tombol jalankan bot bisa memunculkan QR

### 4. Build `.exe`

```bash
npm run dist:win
```

Hasil akan ada di:

```text
dist-electron/
```

### 5. Siapkan paket rilis

```bash
npm run release:package
```

Hasil paket yang lebih rapi akan ada di:

```text
release-package/
```

## File yang biasanya dibagikan

Untuk kolega umum:

1. `IRIS Remote Organizer Setup.exe`

Untuk kolega yang ingin versi tanpa instalasi formal:

1. `IRIS Remote Organizer Portable.exe`
  atau
2. `IRIS Remote Organizer.exe`

Nama file bisa sedikit berbeda tergantung output electron-builder di mesin build, jadi cek folder `dist-electron/` dan `release-package/`.

## Saran distribusi

Untuk kebanyakan kolega non-teknis:

1. bagikan file installer NSIS
2. sertakan petunjuk singkat 3 langkah
3. jika perlu, kirim juga screenshot pengisian field penting:
   - IP / URL Server IRIS
   - Token Internal IRIS
   - Nomor WhatsApp Diizinkan

## Checklist sebelum dibagikan

1. desktop app berhasil dibuka
2. koneksi ke IRIS berhasil dites
3. QR muncul saat bot dijalankan
4. file `.exe` berhasil dibuat
5. release package berhasil disusun
