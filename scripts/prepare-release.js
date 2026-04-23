const fs = require("node:fs/promises");
const path = require("node:path");

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function copyIfExists(from, to) {
  if (await exists(from)) {
    await fs.copyFile(from, to);
    return true;
  }

  return false;
}

async function copyMatchingFiles(fromDir, toDir, matcher) {
  if (!(await exists(fromDir))) {
    return [];
  }

  const entries = await fs.readdir(fromDir);
  const copied = [];

  for (const entry of entries) {
    if (!matcher(entry)) {
      continue;
    }

    await fs.copyFile(path.join(fromDir, entry), path.join(toDir, entry));
    copied.push(entry);
  }

  return copied.sort();
}

async function main() {
  const cwd = process.cwd();
  const distRoot = path.join(cwd, "dist-electron");
  const releaseRoot = path.join(cwd, "release-package");

  await fs.rm(releaseRoot, { recursive: true, force: true });
  await ensureDir(releaseRoot);
  await ensureDir(path.join(releaseRoot, "docs"));
  await ensureDir(path.join(releaseRoot, "assets"));

  const copied = [];
  copied.push(
    ...(await copyMatchingFiles(
      distRoot,
      releaseRoot,
      (file) =>
        /^IRIS[- ]Remote[- ]Organizer/i.test(file) &&
        (file.endsWith(".exe") || file.endsWith(".exe.blockmap")),
    )),
  );

  await copyIfExists(
    path.join(cwd, "INSTALL-1PAGE.md"),
    path.join(releaseRoot, "docs", "INSTALL-1PAGE.md"),
  );
  await copyIfExists(
    path.join(cwd, "docs", "desktop-exe.md"),
    path.join(releaseRoot, "docs", "desktop-exe.md"),
  );
  await copyIfExists(
    path.join(cwd, ".env.remote.example"),
    path.join(releaseRoot, "assets", ".env.remote.example"),
  );
  await copyIfExists(
    path.join(cwd, "release-template.example.json"),
    path.join(releaseRoot, "assets", "release-template.example.json"),
  );

  const summary = [
    "# Release Package",
    "",
    "File yang berhasil disalin:",
    ...copied.map((item) => `- ${item}`),
    "",
    "Catatan:",
    "- Bagikan installer NSIS untuk kolega umum yang ingin proses instal biasa.",
    "- Bagikan versi portable jika ingin cukup satu file exe tanpa instalasi formal.",
    "- File release-template.example.json bisa diimpor dari aplikasi desktop lalu disesuaikan per laptop.",
    "- File contoh konfigurasi ada di assets/.env.remote.example sebagai referensi administrator.",
    "",
  ].join("\n");

  await fs.writeFile(path.join(releaseRoot, "README-RELEASE.txt"), summary, "utf8");

  console.log(`[release] Paket rilis disiapkan di ${releaseRoot}`);
  if (copied.length === 0) {
    console.log("[release] Belum ada file exe yang ditemukan di dist-electron. Jalankan build Windows dulu.");
  }
}

main().catch((error) => {
  console.error("[release] Failed to prepare release package", error);
  process.exit(1);
});
