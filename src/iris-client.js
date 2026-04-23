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

  if (normalized.startsWith("cari ") || normalized.startsWith("cari:") || normalized.includes("carikan")) {
    return {
      intent: "search",
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
    intent: "save_text",
    title: String(text).split(/\s+/).slice(0, 6).join(" "),
    category: "catatan",
    reply: "Catatan ini saya simpan sebagai file teks.",
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
