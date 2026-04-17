const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const MAX_INLINE_PDF_BYTES = 20 * 1024 * 1024

const defaultPrompt = `Baca PDF surat ini dan ekstrak ke JSON mentah tanpa markdown, tanpa penjelasan tambahan.
Gunakan bentuk tepat seperti ini:
{
  "tanggalInputSrikandi": "",
  "tanggalSurat": "",
  "hal": "",
  "tujuan": "",
  "pengonsep": "",
  "catatan": ""
}

Aturan:
- Pakai format tanggal YYYY-MM-DD jika yakin.
- Jika tidak ada nilainya, isi string kosong.
- "hal" harus singkat dan rapi.
- "catatan" boleh berisi ringkasan pendek kalau ada konteks penting.`

const bufferToBase64 = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return btoa(binary)
}

const extractJsonBlock = (text) => {
  const trimmed = text.trim()

  if (!trimmed) {
    throw new Error('Model tidak mengembalikan teks.')
  }

  const fenced = trimmed.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  const firstBrace = fenced.indexOf('{')
  const lastBrace = fenced.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('Respons model tidak berisi JSON yang valid.')
  }

  return fenced.slice(firstBrace, lastBrace + 1)
}

export const normalizeParsedLetter = (payload) => ({
  tanggalInputSrikandi: String(payload?.tanggalInputSrikandi ?? '').trim(),
  tanggalSurat: String(payload?.tanggalSurat ?? '').trim(),
  hal: String(payload?.hal ?? '').trim(),
  tujuan: String(payload?.tujuan ?? '').trim(),
  pengonsep: String(payload?.pengonsep ?? '').trim(),
  catatan: String(payload?.catatan ?? '').trim(),
})

export const parsePdfWithGemini = async ({
  apiKey,
  file,
  model = 'gemini-2.5-flash-lite',
  prompt = defaultPrompt,
}) => {
  if (!apiKey?.trim()) {
    throw new Error('API key Gemini belum diisi.')
  }

  if (!file) {
    throw new Error('File PDF belum dipilih.')
  }

  if (file.type !== 'application/pdf') {
    throw new Error('File harus berformat PDF.')
  }

  if (file.size > MAX_INLINE_PDF_BYTES) {
    throw new Error('Ukuran PDF lebih dari 20 MB. Gunakan file yang lebih kecil.')
  }

  const pdfBuffer = await file.arrayBuffer()
  const inlinePdf = bufferToBase64(pdfBuffer)

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: inlinePdf,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    },
  )

  const payload = await response.json()

  if (!response.ok) {
    const message =
      payload?.error?.message || 'Gemini gagal memproses PDF. Coba lagi beberapa saat.'
    throw new Error(message)
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')

  const normalized = normalizeParsedLetter(JSON.parse(extractJsonBlock(text || '')))

  if (!normalized.hal || !normalized.tanggalInputSrikandi) {
    throw new Error(
      'Hasil parsing belum cukup rapi. Coba PDF lain atau periksa lagi prompt/API key.',
    )
  }

  return normalized
}

export const geminiDefaultPrompt = defaultPrompt
