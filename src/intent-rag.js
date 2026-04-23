const INTENT_GUIDANCE = [
  "Pilih tepat satu intent dari supportedActions.",
  "Jika user meminta daftar/list dokumen, gunakan list_documents walaupun ada kata kirim/kirimkan.",
  "Gunakan send_file hanya jika user merujuk hasil terakhir, misalnya nomor, 'yang pertama', 'kirimkan', atau 'file itu'.",
  "Jika user bertanya informasi umum/terkini dan tidak menyebut arsip/dokumen saya, gunakan ask_general_info.",
  "Kata berita, terbaru, terkini, penelusuran web, internet, browsing, atau cari di web hampir selalu berarti ask_general_info, kecuali user eksplisit menyebut dokumen/arsip/file saya.",
  "Untuk ask_general_info yang membutuhkan web, reply harus berisi jawaban final dalam satu respons sinkron. Jangan kirim status proses terpisah seperti 'sedang mencari'.",
  "Gunakan gaya ringkas, natural, dan langsung membantu. Hindari frasa template seperti 'Ini tampaknya pertanyaan informasi umum'.",
  "Pertanyaan 'siapa kamu', 'jelaskan kamu', dan sapaan tentang identitas bot adalah ask_general_info, bukan help.",
  "Jika user mencari arsip lokal, gunakan search_documents dengan searchQuery yang bersih dari kata perintah.",
  "Saat pendingAction media_save_confirmation, jawaban setuju/nama file harus menjadi save_media.",
  "Saat pendingAction media_save_confirmation, jawaban lemah seperti 'oke', 'ya', 'sip', atau 'lanjut' belum cukup sebagai judul file. Minta nama file yang jelas.",
  "Obrolan santai, candaan, atau keluhan di grup yang tidak meminta arsip lokal jangan diubah menjadi search_documents.",
];

const INTENT_EXAMPLES = [
  {
    id: "list-documents-natural",
    triggers: ["dokumen", "file", "arsip", "apa saja", "apa aja", "punya", "cek", "lihat"],
    context: "User ingin tahu dokumen apa saja yang tersimpan.",
    userText: "coba cek ada dokumen apa saja yang saya punya?",
    decision: { intent: "list_documents" },
    note: "Ini bukan search_documents karena user meminta daftar luas, bukan topik spesifik.",
  },
  {
    id: "send-list-not-file",
    triggers: ["kirim list", "kirim daftar", "kirimi list", "kirimkan daftar", "list dokumen"],
    context: "Kata kirim digunakan untuk meminta daftar, bukan mengirim file.",
    userText: "coba kirim list dokumen yang saya punya",
    decision: { intent: "list_documents" },
    note: "Jangan pilih send_file jika object yang dikirim adalah list/daftar.",
  },
  {
    id: "send-single-followup",
    triggers: ["kirimkan", "kirim", "file itu", "dokumen itu", "yang itu"],
    requiresLastSearchResults: true,
    context: "User merespons setelah bot menampilkan hasil pencarian/daftar.",
    userText: "kirimkan",
    decision: { intent: "send_file", reference: "" },
    note: "Jika hanya ada satu hasil terakhir, reference kosong berarti kirim hasil itu.",
  },
  {
    id: "send-number-followup",
    triggers: ["1", "2", "nomor", "yang pertama", "hasil pertama"],
    requiresLastSearchResults: true,
    context: "User memilih hasil dari daftar terakhir.",
    userText: "kirim 1",
    decision: { intent: "send_file", reference: "1" },
    note: "Nomor saja seperti '1' juga berarti send_file jika lastSearchResults tersedia.",
  },
  {
    id: "search-specific-document",
    triggers: ["cari", "carikan", "ada file", "tentang", "kurikulum", "kontrak", "proposal"],
    context: "User mencari dokumen lokal dengan topik tertentu.",
    userText: "ada file tentang kurikulum AI?",
    decision: { intent: "search_documents", searchQuery: "kurikulum AI" },
    note: "Bersihkan query dari kata 'ada file tentang'.",
  },
  {
    id: "pending-media-save-title",
    triggers: ["simpan", "nama", "judul", "sebagai"],
    requiresPendingAction: "media_save_confirmation",
    context: "User memberi nama setelah upload file dan bot meminta konfirmasi.",
    userText: "simpan saja dengan nama Modul Kurikulum AI",
    decision: {
      intent: "save_media",
      title: "Modul Kurikulum AI",
      category: "catatan",
      tags: ["kurikulum", "AI"],
    },
    note: "Judul adalah bagian natural setelah nama/judul/sebagai, bukan seluruh kalimat.",
  },
  {
    id: "pending-media-weak-confirmation",
    triggers: ["oke", "ok", "sip", "ya", "iya", "lanjut"],
    requiresPendingAction: "media_save_confirmation",
    context: "Bot sedang menunggu nama file, tetapi user hanya memberi konfirmasi singkat.",
    userText: "oke",
    decision: {
      intent: "clarify",
      reply: "Siap. Mau saya simpan dengan nama apa?",
    },
    note: "Jangan jadikan kata konfirmasi singkat sebagai judul file.",
  },
  {
    id: "general-self-intro",
    triggers: ["kamu siapa", "siapa kamu", "bisa apa", "jelaskan kamu", "jelaskan kamu siapa"],
    context: "User bertanya identitas/kemampuan bot.",
    userText: "hai jelaskan kamu siapa",
    decision: {
      intent: "ask_general_info",
      reply:
        "Saya IRIS Organizer, bot WhatsApp yang membantu menyimpan, mencari, dan mengirim kembali dokumen lokal Bapak.",
    },
    note: "Jangan tampilkan help kecuali user eksplisit meminta help/cara pakai.",
  },
  {
    id: "group-small-talk",
    triggers: ["wkwk", "wk", "haha", "kok kamu", "masih bloon", "payah", "tes"],
    context: "User mention bot di grup, tetapi tidak meminta pencarian dokumen atau aksi arsip.",
    userText: "wkwkwkw kok kamu masih bloon siiih",
    decision: {
      intent: "clarify",
      reply: "Kalau mau, saya bisa bantu cari arsip, kirim file, atau simpan dokumen. Tinggal bilang kebutuhannya ya.",
    },
    note: "Jangan jadikan obrolan santai atau candaan sebagai search_documents.",
  },
  {
    id: "general-current-info",
    triggers: [
      "terkini",
      "terbaru",
      "berita",
      "browsing",
      "situasi",
      "perang",
      "penelusuran web",
      "cari di web",
      "internet",
      "web",
    ],
    context: "User bertanya informasi umum/terkini, bukan arsip lokal.",
    userText: "cek situasi terkini perang Iran",
    decision: {
      intent: "ask_general_info",
      reply: "Ringkasan final hasil penelusuran web yang sudah selesai, langsung siap dibaca user.",
    },
    note: "Gunakan search_documents hanya jika user menyebut dokumen/arsip/file saya. Jangan kirim status proses tanpa hasil akhir.",
  },
  {
    id: "local-current-info-search",
    triggers: ["di dokumen saya", "di arsip saya", "dokumen saya", "file saya"],
    context: "User mencari topik di arsip lokal.",
    userText: "cek situasi perang Iran di dokumen saya",
    decision: { intent: "search_documents", searchQuery: "situasi perang Iran" },
    note: "Frasa 'di dokumen saya' mengubah pertanyaan umum menjadi pencarian arsip lokal.",
  },
  {
    id: "cancel-natural",
    triggers: ["batal", "jangan", "salah", "tidak jadi", "ga jadi", "ulang"],
    context: "User membatalkan atau mengoreksi proses.",
    userText: "jangan jadi",
    decision: { intent: "cancel" },
    note: "Jika user menyebut topik baru setelah koreksi, gunakan intent yang sesuai topik baru.",
  },
  {
    id: "whitelist-troubleshooting",
    triggers: ["whitelist", "blacklist", "diabaikan", "nomor", "id", "lid"],
    context: "User bertanya masalah akses WhatsApp.",
    userText: "kenapa pesan saya diabaikan padahal nomor sudah whitelist?",
    decision: {
      intent: "ask_general_info",
      reply:
        "Kemungkinan WhatsApp mengirim identitas sebagai LID, bukan nomor HP. Lihat log Identitas pesan, lalu tambahkan salah satu ID/JID itu ke whitelist.",
    },
    note: "Ini troubleshooting aplikasi, bukan pencarian dokumen.",
  },
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreExample(example, payload) {
  const text = normalize(payload.text);
  const pendingType = payload.pendingAction && payload.pendingAction.type;
  const hasLastResults = Array.isArray(payload.lastSearchResults) && payload.lastSearchResults.length > 0;
  let score = 0;

  for (const trigger of example.triggers || []) {
    const normalizedTrigger = normalize(trigger);
    if (normalizedTrigger && text.includes(normalizedTrigger)) {
      score += normalizedTrigger.includes(" ") ? 8 : normalizedTrigger.length > 2 ? 3 : 1;
    }
  }

  if (
    example.id.includes("send") &&
    !example.id.includes("send-list") &&
    /\b(list|daftar|listnya|daftarnya)\b/.test(text)
  ) {
    score -= 8;
  }

  if (example.id === "send-number-followup" && /\b\d+\b/.test(text)) {
    score += 6;
  }

  if (example.requiresPendingAction) {
    score += pendingType === example.requiresPendingAction ? 8 : -10;
  }

  if (example.requiresLastSearchResults) {
    score += hasLastResults ? 5 : -5;
  }

  return score;
}

function retrieveIntentExamples(payload, limit = 5) {
  const ranked = INTENT_EXAMPLES.map((example) => ({
    example,
    score: scoreExample(example, payload || {}),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.example);

  const fallbackIds = [
    "send-list-not-file",
    "send-single-followup",
    "search-specific-document",
    "general-current-info",
  ];
  for (const id of fallbackIds) {
    if (ranked.length >= limit) break;
    const example = INTENT_EXAMPLES.find((item) => item.id === id);
    if (example && !ranked.some((item) => item.id === id)) {
      ranked.push(example);
    }
  }

  return ranked.slice(0, limit).map(({ id, context, userText, decision, note }) => ({
    id,
    context,
    userText,
    decision,
    note,
  }));
}

module.exports = {
  INTENT_GUIDANCE,
  retrieveIntentExamples,
};
