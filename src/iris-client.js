const axios = require("axios");

function heuristicDecision(text) {
  const normalized = String(text || "").trim().toLowerCase();

  if (!normalized) {
    return {
      intent: "clarify",
      reply: "Pesannya masih kosong. Kalau Bapak mau, saya bisa bantu simpan catatan atau cari dokumen.",
    };
  }

  if (normalized === "help" || normalized.includes("bantuan")) {
    return { intent: "help" };
  }

  if (normalized === "batal" || normalized.includes("cancel")) {
    return { intent: "cancel" };
  }

  if (
    /\b(list|daftar|tampilkan|lihat|cek|cari|carikan|kirimi|kirimkan|kasih)\b/.test(normalized) &&
    /\b(dokumen|file|arsip|berkas|data)\b/.test(normalized) &&
    /\b(yang ada|semua|tersimpan|terbaru|terakhir|listnya|daftarnya|apa saja|apa aja)\b/.test(normalized)
  ) {
    return { intent: "list_documents" };
  }

  if (normalized.startsWith("cari ") || normalized.startsWith("cari:") || normalized.includes("carikan")) {
    return {
      intent: "search_documents",
      searchQuery: text.replace(/^cari\s*:?\s*/i, "").trim(),
    };
  }

  if (normalized.startsWith("kirim ") || normalized.startsWith("kirim:") || normalized.includes("kirimkan")) {
    return {
      intent: "send_file",
      reference: text
        .replace(/^kirim(?:kan)?\s*:?\s*/i, "")
        .replace(/^(ke\s+sini|sini|file(?:nya)?|dokumen(?:nya)?|hasil(?:nya)?)$/i, "")
        .trim(),
    };
  }

  return {
    intent: "ask_general_info",
    reply:
      "IRIS sedang tidak bisa dihubungi, jadi saya belum bisa memahami bebas atau mencari informasi umum. Saya tetap bisa bantu perintah dasar seperti help, batal, cari dokumen, dan kirim hasil.",
  };
}

async function decideIntent(config, payload) {
  const url = new URL(config.irisDecidePath, config.irisBaseUrl).toString();

  try {
    const response = await axios.post(url, payload, {
      timeout: config.irisTimeoutMs,
      headers: {
        Authorization: `Bearer ${config.irisApiToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error) {
    if (!config.irisFallbackEnabled) {
      throw error;
    }

    console.warn("[iris] Remote intent failed, using heuristic fallback", error.message);
    return heuristicDecision(payload.text || "");
  }
}

module.exports = {
  decideIntent,
};
