const nowIso = () => new Date().toISOString()

const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `surat-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const truthyValues = new Set(['ya', 'y', 'yes', 'true', '1', 'sudah', 'ok'])

export const FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'need-verification', label: 'Belum verif' },
  { value: 'need-signature', label: 'Belum tanda tangan' },
  { value: 'need-delivery', label: 'Belum dikirim' },
  { value: 'completed', label: 'Selesai' },
]

export const REMINDER_INTERVALS = [
  { value: 2, label: 'Setiap 2 jam' },
  { value: 4, label: 'Setiap 4 jam' },
  { value: 8, label: 'Setiap 8 jam' },
  { value: 24, label: 'Setiap 1 hari' },
]

export const DEFAULT_FORM = {
  tanggalInputSrikandi: '',
  tanggalSurat: '',
  hal: '',
  tujuan: '',
  pengonsep: '',
  catatan: '',
}

export const DEFAULT_REMINDER_SETTINGS = {
  enabled: false,
  intervalHours: 2,
  quietStart: 22,
  quietEnd: 6,
  lastReminderAt: '',
}

export const INITIAL_LETTERS = [
  {
    id: makeId(),
    tanggalInputSrikandi: '2026-04-17',
    tanggalSurat: '2026-04-17',
    hal: 'Permohonan data tindak lanjut monitoring triwulan I',
    tujuan: 'Bagian Perencanaan',
    pengonsep: 'Subbag TU',
    catatan: 'Perlu dikirim hari ini sebelum pukul 15.00.',
    verifAt: '2026-04-17T08:05:00.000Z',
    tandaTanganAt: '',
    dikirimPengonsepAt: '',
    dikirimTujuanAt: '',
    dikirimPihakButuhAt: '',
    lastUpdate: '2026-04-17T08:05:00.000Z',
  },
  {
    id: makeId(),
    tanggalInputSrikandi: '2026-04-16',
    tanggalSurat: '2026-04-16',
    hal: 'Penyampaian undangan rapat koordinasi',
    tujuan: 'Sekretariat Daerah',
    pengonsep: 'Bagian Umum',
    catatan: '',
    verifAt: '2026-04-16T02:15:00.000Z',
    tandaTanganAt: '2026-04-16T03:05:00.000Z',
    dikirimPengonsepAt: '',
    dikirimTujuanAt: '2026-04-16T06:25:00.000Z',
    dikirimPihakButuhAt: '',
    lastUpdate: '2026-04-16T06:25:00.000Z',
  },
  {
    id: makeId(),
    tanggalInputSrikandi: '2026-04-15',
    tanggalSurat: '',
    hal: 'Nota dinas kebutuhan bahan paparan pimpinan',
    tujuan: '',
    pengonsep: 'Analis Kebijakan',
    catatan: 'Menunggu verifikasi terakhir.',
    verifAt: '',
    tandaTanganAt: '',
    dikirimPengonsepAt: '',
    dikirimTujuanAt: '',
    dikirimPihakButuhAt: '',
    lastUpdate: '2026-04-15T09:40:00.000Z',
  },
  {
    id: makeId(),
    tanggalInputSrikandi: '2026-04-14',
    tanggalSurat: '2026-04-14',
    hal: 'Pengiriman rekap tindak lanjut surat masuk',
    tujuan: 'Inspektorat',
    pengonsep: 'Subkoordinator Evaluasi',
    catatan: 'Sudah beres semua.',
    verifAt: '2026-04-14T01:15:00.000Z',
    tandaTanganAt: '2026-04-14T02:05:00.000Z',
    dikirimPengonsepAt: '2026-04-14T02:20:00.000Z',
    dikirimTujuanAt: '2026-04-14T04:15:00.000Z',
    dikirimPihakButuhAt: '2026-04-14T05:10:00.000Z',
    lastUpdate: '2026-04-14T05:10:00.000Z',
  },
]

export const makeLetterPayload = (form, overrides = {}) => {
  const createdAt = overrides.createdAt ?? nowIso()
  const toStamp = (value) => (value ? createdAt : '')

  return {
    id: overrides.id ?? makeId(),
    tanggalInputSrikandi: form.tanggalInputSrikandi || '',
    tanggalSurat: form.tanggalSurat || '',
    hal: form.hal?.trim() || '',
    tujuan: form.tujuan?.trim() || '',
    pengonsep: form.pengonsep?.trim() || '',
    catatan: form.catatan?.trim() || '',
    verifAt: overrides.verifAt ?? toStamp(overrides.verif ?? false),
    tandaTanganAt: overrides.tandaTanganAt ?? toStamp(overrides.tandaTangan ?? false),
    dikirimPengonsepAt:
      overrides.dikirimPengonsepAt ?? toStamp(overrides.dikirimPengonsep ?? false),
    dikirimTujuanAt: overrides.dikirimTujuanAt ?? toStamp(overrides.dikirimTujuan ?? false),
    dikirimPihakButuhAt:
      overrides.dikirimPihakButuhAt ?? toStamp(overrides.dikirimPihakButuh ?? false),
    lastUpdate: overrides.lastUpdate ?? createdAt,
  }
}

export const isTruthyImport = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (!value) return false

  return truthyValues.has(String(value).trim().toLowerCase())
}

export const getCompletionCount = (letter) => {
  const checkpoints = [
    letter.verifAt,
    letter.tandaTanganAt,
    letter.dikirimPengonsepAt || letter.dikirimTujuanAt || letter.dikirimPihakButuhAt,
  ]

  return checkpoints.filter(Boolean).length
}

export const isCompletedLetter = (letter) =>
  Boolean(
    letter.verifAt &&
      letter.tandaTanganAt &&
      (letter.dikirimPengonsepAt || letter.dikirimTujuanAt || letter.dikirimPihakButuhAt),
  )

export const getLetterStage = (letter) => {
  if (!letter.verifAt) {
    return {
      tone: 'warning',
      label: 'Menunggu verif',
      shortLabel: 'Belum verif',
    }
  }

  if (!letter.tandaTanganAt) {
    return {
      tone: 'attention',
      label: 'Menunggu tanda tangan',
      shortLabel: 'Belum tanda tangan',
    }
  }

  if (
    !letter.dikirimPengonsepAt &&
    !letter.dikirimTujuanAt &&
    !letter.dikirimPihakButuhAt
  ) {
    return {
      tone: 'info',
      label: 'Siap dikirim',
      shortLabel: 'Belum dikirim',
    }
  }

  if (isCompletedLetter(letter)) {
    return {
      tone: 'success',
      label: 'Selesai',
      shortLabel: 'Selesai',
    }
  }

  return {
    tone: 'neutral',
    label: 'Sedang berjalan',
    shortLabel: 'Berjalan',
  }
}

export const applyFilter = (letters, filterValue) => {
  switch (filterValue) {
    case 'need-verification':
      return letters.filter((letter) => !letter.verifAt)
    case 'need-signature':
      return letters.filter((letter) => letter.verifAt && !letter.tandaTanganAt)
    case 'need-delivery':
      return letters.filter(
        (letter) =>
          letter.verifAt &&
          letter.tandaTanganAt &&
          !letter.dikirimPengonsepAt &&
          !letter.dikirimTujuanAt &&
          !letter.dikirimPihakButuhAt,
      )
    case 'completed':
      return letters.filter(isCompletedLetter)
    default:
      return letters
  }
}

export const searchLetters = (letters, query) => {
  const keyword = query.trim().toLowerCase()

  if (!keyword) return letters

  return letters.filter((letter) =>
    [
      letter.hal,
      letter.tujuan,
      letter.pengonsep,
      letter.catatan,
      letter.tanggalInputSrikandi,
      letter.tanggalSurat,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  )
}
