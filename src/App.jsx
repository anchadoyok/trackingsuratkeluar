import { useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  ChevronLeft,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutGrid,
  ListFilter,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Plus,
  Save,
  Search,
  TableProperties,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import './App.css'
import { geminiDefaultPrompt, parsePdfWithGemini } from './lib/gemini'
import {
  applyFilter,
  DEFAULT_FORM,
  DEFAULT_REMINDER_SETTINGS,
  FILTER_OPTIONS,
  getCompletionCount,
  getLetterStage,
  INITIAL_LETTERS,
  isCompletedLetter,
  isTruthyImport,
  makeLetterPayload,
  REMINDER_INTERVALS,
  searchLetters,
} from './lib/surat'

const LETTERS_KEY = 'tracking-surat/letters'
const REMINDER_KEY = 'tracking-surat/reminders'
const PARSER_KEY = 'tracking-surat/parser-settings'

const tabs = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'letters', label: 'Data surat' },
  { value: 'input', label: 'Input & parsing' },
  { value: 'reminders', label: 'Reminder' },
]

const defaultParserSettings = {
  apiKey: '',
  model: 'gemini-2.5-flash-lite',
  prompt: geminiDefaultPrompt,
}

const stageCounters = (letters) => ({
  total: letters.length,
  needVerification: letters.filter((letter) => !letter.verifAt).length,
  needSignature: letters.filter((letter) => letter.verifAt && !letter.tandaTanganAt).length,
  needDelivery: letters.filter(
    (letter) =>
      letter.verifAt &&
      letter.tandaTanganAt &&
      !letter.dikirimPengonsepAt &&
      !letter.dikirimTujuanAt &&
      !letter.dikirimPihakButuhAt,
  ).length,
  completed: letters.filter(isCompletedLetter).length,
})

const loadFromStorage = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const formatDate = (value) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

const formatDateTime = (value) => {
  if (!value) return 'Belum ada'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const sortLettersByUpdate = (letters) =>
  [...letters].sort(
    (left, right) => new Date(right.lastUpdate).getTime() - new Date(left.lastUpdate).getTime(),
  )

const exportTemplateWorkbook = async () => {
  const XLSX = await import('xlsx')
  const templateRows = [
    {
      tanggal_input_srikandi: '2026-04-17',
      tanggal_surat: '2026-04-17',
      hal: 'Contoh hal surat',
      tujuan: 'Bagian Umum',
      pengonsep: 'Subbag TU',
      verif: 'ya',
      tandatangan: 'tidak',
      kirim_pengonsep: 'tidak',
      kirim_tujuan: 'tidak',
      kirim_pihak_butuh: 'tidak',
      catatan: 'Boleh dikosongkan',
    },
  ]

  const workbook = XLSX.utils.book_new()
  const templateSheet = XLSX.utils.json_to_sheet(templateRows)
  const guideSheet = XLSX.utils.json_to_sheet([
    { kolom: 'tanggal_input_srikandi', aturan: 'Wajib. Format YYYY-MM-DD.' },
    { kolom: 'hal', aturan: 'Wajib. Ringkas dan mudah dicari.' },
    { kolom: 'tujuan / pengonsep / catatan', aturan: 'Opsional.' },
    { kolom: 'verif / tandatangan / kirim_*', aturan: 'Isi ya/tidak.' },
  ])

  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template')
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Panduan')
  XLSX.writeFile(workbook, 'template-tracking-surat.xlsx')
}

const normalizeRowValue = (row, aliases) => {
  const entries = Object.entries(row).map(([key, value]) => [
    key.trim().toLowerCase(),
    typeof value === 'string' ? value.trim() : value,
  ])

  for (const alias of aliases) {
    const match = entries.find(([key]) => key === alias)
    if (match) return match[1]
  }

  return ''
}

const mapImportedRow = (row) => {
  const createdAt = new Date().toISOString()

  return makeLetterPayload(
    {
      tanggalInputSrikandi: normalizeRowValue(row, [
        'tanggal_input_srikandi',
        'tanggal input srikandi',
        'tgl_input_srikandi',
        'tgl input srikandi',
      ]),
      tanggalSurat: normalizeRowValue(row, ['tanggal_surat', 'tanggal surat', 'tgl_surat']),
      hal: normalizeRowValue(row, ['hal', 'perihal']),
      tujuan: normalizeRowValue(row, ['tujuan']),
      pengonsep: normalizeRowValue(row, ['pengonsep']),
      catatan: normalizeRowValue(row, ['catatan']),
    },
    {
      createdAt,
      verif: isTruthyImport(normalizeRowValue(row, ['verif', 'sudah_verif'])),
      tandaTangan: isTruthyImport(
        normalizeRowValue(row, ['tandatangan', 'tanda_tangan', 'sudah_ttd']),
      ),
      dikirimPengonsep: isTruthyImport(
        normalizeRowValue(row, ['kirim_pengonsep', 'dikirim_pengonsep']),
      ),
      dikirimTujuan: isTruthyImport(
        normalizeRowValue(row, ['kirim_tujuan', 'dikirim_tujuan']),
      ),
      dikirimPihakButuh: isTruthyImport(
        normalizeRowValue(row, [
          'kirim_pihak_butuh',
          'dikirim_pihak_butuh',
          'dikirim_pihak_butuhkan',
        ]),
      ),
      lastUpdate: createdAt,
    },
  )
}

const readWorkbookFile = async (file) => {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]

  return XLSX.utils.sheet_to_json(firstSheet, {
    defval: '',
    raw: false,
  })
}

const isWithinQuietHours = (date, startHour, endHour) => {
  const currentHour = date.getHours()

  if (startHour === endHour) return false
  if (startHour < endHour) return currentHour >= startHour && currentHour < endHour

  return currentHour >= startHour || currentHour < endHour
}

const buildNotificationBody = (letters) => {
  const counters = stageCounters(letters)
  const items = []

  if (counters.needVerification) items.push(`${counters.needVerification} belum verif`)
  if (counters.needSignature) items.push(`${counters.needSignature} belum tanda tangan`)
  if (counters.needDelivery) items.push(`${counters.needDelivery} belum dikirim`)

  return items.length ? `Masih ada ${items.join(', ')}.` : 'Semua surat sudah tertangani.'
}

const StatusControl = ({ active, title, subtitle, onClick }) => (
  <button type="button" className={`status-control ${active ? 'is-active' : ''}`} onClick={onClick}>
    <span className="status-control__radio" aria-hidden="true">
      <span />
    </span>
    <span className="status-control__copy">
      <strong>{title}</strong>
      <small>{subtitle}</small>
    </span>
  </button>
)

const LetterCard = ({ letter, active, onClick }) => {
  const stage = getLetterStage(letter)

  return (
    <button type="button" className={`letter-card ${active ? 'is-active' : ''}`} onClick={onClick}>
      <div className="letter-card__top">
        <span className={`status-pill ${stage.tone}`}>{stage.shortLabel}</span>
        <span className="progress-pill">{getCompletionCount(letter)}/3</span>
      </div>
      <strong>{letter.hal}</strong>
      <p>{letter.tujuan || 'Tujuan belum diisi'}</p>
      <small>
        {formatDate(letter.tanggalInputSrikandi)} | {letter.pengonsep || 'Pengonsep belum diisi'}
      </small>
    </button>
  )
}

const LetterTable = ({ letters, selectedId, onSelect }) => (
  <div className="table-shell">
    <table className="letters-table">
      <thead>
        <tr>
          <th>Hal</th>
          <th>Tanggal input</th>
          <th>Tujuan</th>
          <th>Progress</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {letters.map((letter) => {
          const stage = getLetterStage(letter)

          return (
            <tr
              key={letter.id}
              className={selectedId === letter.id ? 'is-active' : ''}
              onClick={() => onSelect(letter.id)}
            >
              <td>
                <strong>{letter.hal}</strong>
                <small>{letter.pengonsep || 'Pengonsep belum diisi'}</small>
              </td>
              <td>{formatDate(letter.tanggalInputSrikandi)}</td>
              <td>{letter.tujuan || '-'}</td>
              <td>{getCompletionCount(letter)}/3</td>
              <td>
                <span className={`status-pill ${stage.tone}`}>{stage.shortLabel}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

function App() {
  const initialLetters = useMemo(() => loadFromStorage(LETTERS_KEY, INITIAL_LETTERS), [])
  const [letters, setLetters] = useState(initialLetters)
  const [activeTab, setActiveTab] = useState('letters')
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [viewMode, setViewMode] = useState('table')
  const [selectedId, setSelectedId] = useState(initialLetters[0]?.id ?? null)
  const [detailVisible, setDetailVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 960)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [importInfo, setImportInfo] = useState({
    tone: 'neutral',
    message: 'Manual, bulk upload, dan parsing PDF tersedia di sini.',
  })
  const [reminderSettings, setReminderSettings] = useState(() =>
    loadFromStorage(REMINDER_KEY, DEFAULT_REMINDER_SETTINGS),
  )
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [parserSettings, setParserSettings] = useState(() =>
    loadFromStorage(PARSER_KEY, defaultParserSettings),
  )
  const [parserState, setParserState] = useState({
    file: null,
    loading: false,
    error: '',
    parsed: null,
  })
  const [editingId, setEditingId] = useState(null)
  const [detailDraft, setDetailDraft] = useState(DEFAULT_FORM)

  useEffect(() => {
    window.localStorage.setItem(LETTERS_KEY, JSON.stringify(letters))
  }, [letters])

  useEffect(() => {
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify(reminderSettings))
  }, [reminderSettings])

  useEffect(() => {
    window.localStorage.setItem(PARSER_KEY, JSON.stringify(parserSettings))
  }, [parserSettings])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 959px)')
    const handleChange = (event) => {
      setIsMobile(event.matches)
      if (!event.matches) {
        setMobileDetailOpen(false)
      }
    }

    handleChange(media)
    media.addEventListener('change', handleChange)

    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!letters.some((letter) => letter.id === selectedId)) {
      setSelectedId(letters[0]?.id ?? null)
    }
  }, [letters, selectedId])

  useEffect(() => {
    if (
      !reminderSettings.enabled ||
      notificationPermission !== 'granted' ||
      typeof Notification === 'undefined'
    ) {
      return undefined
    }

    const notifyIfNeeded = () => {
      const pending = letters.filter((letter) => !isCompletedLetter(letter))
      if (!pending.length) return

      const now = new Date()
      if (
        isWithinQuietHours(now, Number(reminderSettings.quietStart), Number(reminderSettings.quietEnd))
      ) {
        return
      }

      const previous = reminderSettings.lastReminderAt
        ? new Date(reminderSettings.lastReminderAt)
        : null
      const elapsed = previous ? now.getTime() - previous.getTime() : Infinity
      const threshold = Number(reminderSettings.intervalHours) * 60 * 60 * 1000

      if (elapsed < threshold) return

      new Notification('Tracking Surat Keluar', {
        body: buildNotificationBody(pending),
        tag: 'tracking-surat-reminder',
      })

      setReminderSettings((current) => ({
        ...current,
        lastReminderAt: now.toISOString(),
      }))
    }

    notifyIfNeeded()
    const timer = window.setInterval(notifyIfNeeded, 60_000)

    return () => window.clearInterval(timer)
  }, [letters, notificationPermission, reminderSettings])

  const counters = useMemo(() => stageCounters(letters), [letters])
  const sortedLetters = useMemo(() => sortLettersByUpdate(letters), [letters])

  const filteredLetters = useMemo(() => {
    const searched = searchLetters(sortedLetters, query)
    return applyFilter(searched, activeFilter)
  }, [activeFilter, query, sortedLetters])

  const selectedLetter = useMemo(
    () => letters.find((letter) => letter.id === selectedId) ?? letters[0] ?? null,
    [letters, selectedId],
  )

  const urgentLetters = useMemo(
    () => sortedLetters.filter((letter) => !isCompletedLetter(letter)).slice(0, 5),
    [sortedLetters],
  )

  const pickLetter = (id) => {
    setSelectedId(id)
    if (isMobile) {
      setMobileDetailOpen(true)
    } else {
      setDetailVisible(true)
    }
  }

  const updateLetter = (id, field) => {
    const nextStamp = new Date().toISOString()

    setLetters((current) =>
      current.map((letter) => {
        if (letter.id !== id) return letter

        return {
          ...letter,
          [field]: letter[field] ? '' : nextStamp,
          lastUpdate: nextStamp,
        }
      }),
    )
  }

  const startEditingLetter = (letter) => {
    if (!letter) return

    setEditingId(letter.id)
    setDetailDraft({
      tanggalInputSrikandi: letter.tanggalInputSrikandi || '',
      tanggalSurat: letter.tanggalSurat || '',
      hal: letter.hal || '',
      tujuan: letter.tujuan || '',
      pengonsep: letter.pengonsep || '',
      catatan: letter.catatan || '',
    })
  }

  const cancelEditingLetter = () => {
    setEditingId(null)
    setDetailDraft(DEFAULT_FORM)
  }

  const saveEditedLetter = (id) => {
    if (!detailDraft.tanggalInputSrikandi || !detailDraft.hal.trim()) {
      setImportInfo({
        tone: 'danger',
        message: 'Tanggal input Srikandi dan hal wajib diisi saat edit surat.',
      })
      return
    }

    const nextStamp = new Date().toISOString()

    setLetters((current) =>
      current.map((letter) => {
        if (letter.id !== id) return letter

        return {
          ...letter,
          tanggalInputSrikandi: detailDraft.tanggalInputSrikandi,
          tanggalSurat: detailDraft.tanggalSurat,
          hal: detailDraft.hal.trim(),
          tujuan: detailDraft.tujuan.trim(),
          pengonsep: detailDraft.pengonsep.trim(),
          catatan: detailDraft.catatan.trim(),
          lastUpdate: nextStamp,
        }
      }),
    )

    setEditingId(null)
    setDetailDraft(DEFAULT_FORM)
    setImportInfo({
      tone: 'success',
      message: 'Detail surat berhasil diperbarui.',
    })
  }

  const deleteLetter = (id) => {
    const target = letters.find((letter) => letter.id === id)
    if (!target) return

    const confirmed = window.confirm(`Hapus surat "${target.hal}"?`)
    if (!confirmed) return

    setLetters((current) => current.filter((letter) => letter.id !== id))
    setEditingId(null)
    setDetailDraft(DEFAULT_FORM)
    setMobileDetailOpen(false)
    setImportInfo({
      tone: 'success',
      message: 'Surat berhasil dihapus.',
    })
  }

  const handleInputChange = ({ target }) => {
    const { name, value } = target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleCreateLetter = (event) => {
    event.preventDefault()

    if (!form.tanggalInputSrikandi || !form.hal.trim()) {
      setImportInfo({
        tone: 'danger',
        message: 'Tanggal input Srikandi dan hal wajib diisi.',
      })
      return
    }

    const payload = makeLetterPayload(form)

    setLetters((current) => [payload, ...current])
    setSelectedId(payload.id)
    setForm(DEFAULT_FORM)
    setActiveTab('letters')
    setImportInfo({
      tone: 'success',
      message: 'Surat berhasil ditambahkan.',
    })
  }

  const handleImport = async ({ target }) => {
    const file = target.files?.[0]
    if (!file) return

    setImportInfo({
      tone: 'neutral',
      message: `Membaca file ${file.name}...`,
    })

    try {
      const rows = await readWorkbookFile(file)
      const mapped = rows.map(mapImportedRow).filter((row) => row.tanggalInputSrikandi && row.hal)

      if (!mapped.length) {
        setImportInfo({
          tone: 'danger',
          message: 'Data tidak terbaca. Pastikan kolom wajib cocok dengan template.',
        })
        return
      }

      setLetters((current) => [...mapped, ...current])
      setSelectedId(mapped[0].id)
      setImportInfo({
        tone: 'success',
        message: `${mapped.length} surat berhasil diimpor.`,
      })
      setActiveTab('letters')
    } catch {
      setImportInfo({
        tone: 'danger',
        message: 'File gagal dibaca. Gunakan CSV, XLS, atau XLSX yang sesuai template.',
      })
    } finally {
      target.value = ''
    }
  }

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const sendTestNotification = () => {
    if (notificationPermission !== 'granted') return

    new Notification('Tes reminder surat', {
      body: 'Reminder browser sudah siap dipakai.',
      tag: 'tracking-surat-test',
    })
  }

  const applyParsedToForm = () => {
    if (!parserState.parsed) return

    setForm(parserState.parsed)
    setActiveTab('input')
    setImportInfo({
      tone: 'success',
      message: 'Hasil parsing dipindahkan ke form. Tinggal cek lalu simpan.',
    })
  }

  const handleParsePdf = async () => {
    setParserState((current) => ({
      ...current,
      loading: true,
      error: '',
      parsed: null,
    }))

    try {
      const parsed = await parsePdfWithGemini({
        apiKey: parserSettings.apiKey,
        model: parserSettings.model,
        prompt: parserSettings.prompt,
        file: parserState.file,
      })

      setParserState((current) => ({
        ...current,
        loading: false,
        parsed,
      }))
    } catch (error) {
      setParserState((current) => ({
        ...current,
        loading: false,
        error: error.message,
      }))
    }
  }

  const renderDetail = (letter, mobile = false) => {
    if (!letter) return null

    const stage = getLetterStage(letter)
    const isEditing = editingId === letter.id

    return (
      <section className={`detail-panel ${mobile ? 'is-mobile' : ''}`}>
        <div className="detail-panel__head">
          <div>
            <small className="section-label">Detail surat</small>
            <h2>{letter.hal}</h2>
          </div>
          <span className={`status-pill ${stage.tone}`}>{stage.label}</span>
        </div>

        <div className="detail-actions-bar">
          {isEditing ? (
            <>
              <button
                type="button"
                className="primary-button detail-action-button"
                onClick={() => saveEditedLetter(letter.id)}
              >
                <Save size={18} />
                Simpan
              </button>
              <button
                type="button"
                className="ghost-button detail-action-button"
                onClick={cancelEditingLetter}
              >
                <X size={18} />
                Batal
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button detail-action-button"
              onClick={() => startEditingLetter(letter)}
            >
              <PencilLine size={18} />
              Edit surat
            </button>
          )}

          <button
            type="button"
            className="ghost-button danger-button detail-action-button"
            onClick={() => deleteLetter(letter.id)}
          >
            <Trash2 size={18} />
            Hapus
          </button>
        </div>

        {isEditing ? (
          <div className="detail-edit-grid">
            <label>
              Tanggal input Srikandi *
              <input
                type="date"
                value={detailDraft.tanggalInputSrikandi}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    tanggalInputSrikandi: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Tanggal surat
              <input
                type="date"
                value={detailDraft.tanggalSurat}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    tanggalSurat: event.target.value,
                  }))
                }
              />
            </label>
            <label className="span-two">
              Hal *
              <input
                type="text"
                value={detailDraft.hal}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    hal: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Tujuan
              <input
                type="text"
                value={detailDraft.tujuan}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    tujuan: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Pengonsep
              <input
                type="text"
                value={detailDraft.pengonsep}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    pengonsep: event.target.value,
                  }))
                }
              />
            </label>
            <label className="span-two">
              Catatan
              <textarea
                rows="4"
                value={detailDraft.catatan}
                onChange={(event) =>
                  setDetailDraft((current) => ({
                    ...current,
                    catatan: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        ) : (
          <div className="detail-grid">
            <div>
              <span>Tanggal input Srikandi</span>
              <strong>{formatDate(letter.tanggalInputSrikandi)}</strong>
            </div>
            <div>
              <span>Tanggal surat</span>
              <strong>{formatDate(letter.tanggalSurat)}</strong>
            </div>
            <div>
              <span>Tujuan</span>
              <strong>{letter.tujuan || '-'}</strong>
            </div>
            <div>
              <span>Pengonsep</span>
              <strong>{letter.pengonsep || '-'}</strong>
            </div>
          </div>
        )}

        <div className="status-stack">
          <StatusControl
            active={Boolean(letter.verifAt)}
            title="Sudah verif"
            subtitle={formatDateTime(letter.verifAt)}
            onClick={() => updateLetter(letter.id, 'verifAt')}
          />
          <StatusControl
            active={Boolean(letter.tandaTanganAt)}
            title="Sudah tanda tangan"
            subtitle={formatDateTime(letter.tandaTanganAt)}
            onClick={() => updateLetter(letter.id, 'tandaTanganAt')}
          />
          <StatusControl
            active={Boolean(letter.dikirimPengonsepAt)}
            title="Dikirim ke pengonsep"
            subtitle={formatDateTime(letter.dikirimPengonsepAt)}
            onClick={() => updateLetter(letter.id, 'dikirimPengonsepAt')}
          />
          <StatusControl
            active={Boolean(letter.dikirimTujuanAt)}
            title="Dikirim ke tujuan"
            subtitle={formatDateTime(letter.dikirimTujuanAt)}
            onClick={() => updateLetter(letter.id, 'dikirimTujuanAt')}
          />
          <StatusControl
            active={Boolean(letter.dikirimPihakButuhAt)}
            title="Dikirim ke pihak membutuhkan"
            subtitle={formatDateTime(letter.dikirimPihakButuhAt)}
            onClick={() => updateLetter(letter.id, 'dikirimPihakButuhAt')}
          />
        </div>

        <div className="note-box">
          <span>Catatan</span>
          <p>{letter.catatan || 'Belum ada catatan.'}</p>
        </div>

        <div className="note-box muted">
          <span>Last update</span>
          <p>{formatDateTime(letter.lastUpdate)}</p>
        </div>
      </section>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Tracking Surat Keluar</h1>
          <small>Ringkas, cepat dicari, dan gampang di-update.</small>
        </div>

        <div className="topbar__actions">
          {!isMobile && (activeTab === 'dashboard' || activeTab === 'letters') && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setDetailVisible((current) => !current)}
            >
              {detailVisible ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              {detailVisible ? 'Sembunyikan detail' : 'Tampilkan detail'}
            </button>
          )}
          <button type="button" className="primary-button" onClick={() => setActiveTab('input')}>
            <Plus size={18} />
            Tambah surat
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="Navigasi utama">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`tabbar__item ${activeTab === tab.value ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'dashboard' && (
        <section className="dashboard">
          <div className="stats-row">
            <article className="metric-card">
              <span>Total surat</span>
              <strong>{counters.total}</strong>
            </article>
            <article className="metric-card">
              <span>Belum verif</span>
              <strong>{counters.needVerification}</strong>
            </article>
            <article className="metric-card">
              <span>Belum tanda tangan</span>
              <strong>{counters.needSignature}</strong>
            </article>
            <article className="metric-card">
              <span>Belum dikirim</span>
              <strong>{counters.needDelivery}</strong>
            </article>
          </div>

          <div className={`split-layout ${detailVisible && !isMobile ? '' : 'no-detail'}`}>
            <section className="main-panel">
              <div className="section-head">
                <div>
                  <small className="section-label">Prioritas</small>
                  <h2>Surat yang masih perlu ditindaklanjuti</h2>
                </div>
                <button type="button" className="ghost-button" onClick={() => setActiveTab('letters')}>
                  <ListFilter size={18} />
                  Buka daftar lengkap
                </button>
              </div>

              <div className="compact-list">
                {urgentLetters.map((letter) => (
                  <button
                    key={letter.id}
                    type="button"
                    className="compact-row"
                    onClick={() => pickLetter(letter.id)}
                  >
                    <div>
                      <strong>{letter.hal}</strong>
                      <small>
                        {letter.tujuan || 'Tujuan belum diisi'} | {formatDate(letter.tanggalInputSrikandi)}
                      </small>
                    </div>
                    <span className={`status-pill ${getLetterStage(letter).tone}`}>
                      {getLetterStage(letter).shortLabel}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {!isMobile && detailVisible && selectedLetter && renderDetail(selectedLetter)}
          </div>
        </section>
      )}

      {activeTab === 'letters' && (
        <section className={`split-layout ${detailVisible && !isMobile ? '' : 'no-detail'}`}>
          <section className="main-panel">
            <div className="toolbar">
              <label className="search-box">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari hal, tujuan, pengonsep, atau catatan"
                />
              </label>

              <div className="toolbar__actions">
                <div className="view-toggle" role="tablist" aria-label="Mode tampilan">
                  <button
                    type="button"
                    className={viewMode === 'card' ? 'is-active' : ''}
                    onClick={() => setViewMode('card')}
                  >
                    <LayoutGrid size={16} />
                    Card
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'table' ? 'is-active' : ''}
                    onClick={() => setViewMode('table')}
                  >
                    <TableProperties size={16} />
                    Tabel
                  </button>
                </div>
              </div>
            </div>

            <div className="filter-bar">
              <span>
                <Filter size={16} />
                Filter
              </span>
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`filter-chip ${activeFilter === option.value ? 'is-active' : ''}`}
                  onClick={() => setActiveFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {viewMode === 'card' ? (
              <div className="card-grid">
                {filteredLetters.map((letter) => (
                  <LetterCard
                    key={letter.id}
                    letter={letter}
                    active={selectedId === letter.id}
                    onClick={() => pickLetter(letter.id)}
                  />
                ))}
              </div>
            ) : (
              <LetterTable letters={filteredLetters} selectedId={selectedId} onSelect={pickLetter} />
            )}
          </section>

          {!isMobile && detailVisible && selectedLetter && renderDetail(selectedLetter)}
        </section>
      )}

      {activeTab === 'input' && (
        <section className="input-grid">
          <section className="main-panel">
            <div className="section-head">
              <div>
                <small className="section-label">Input manual</small>
                <h2>Tambah surat tanpa form yang ribet</h2>
              </div>
            </div>

            <form className="form-grid" onSubmit={handleCreateLetter}>
              <label>
                Tanggal input Srikandi *
                <input
                  required
                  type="date"
                  name="tanggalInputSrikandi"
                  value={form.tanggalInputSrikandi}
                  onChange={handleInputChange}
                />
              </label>
              <label>
                Tanggal surat
                <input
                  type="date"
                  name="tanggalSurat"
                  value={form.tanggalSurat}
                  onChange={handleInputChange}
                />
              </label>
              <label className="span-two">
                Hal *
                <input
                  required
                  type="text"
                  name="hal"
                  value={form.hal}
                  placeholder="Contoh: Permintaan data monitoring"
                  onChange={handleInputChange}
                />
              </label>
              <label>
                Tujuan
                <input
                  type="text"
                  name="tujuan"
                  value={form.tujuan}
                  placeholder="Opsional"
                  onChange={handleInputChange}
                />
              </label>
              <label>
                Pengonsep
                <input
                  type="text"
                  name="pengonsep"
                  value={form.pengonsep}
                  placeholder="Opsional"
                  onChange={handleInputChange}
                />
              </label>
              <label className="span-two">
                Catatan
                <textarea
                  rows="4"
                  name="catatan"
                  value={form.catatan}
                  placeholder="Opsional"
                  onChange={handleInputChange}
                />
              </label>
              <button type="submit" className="primary-button wide">
                <Plus size={18} />
                Simpan surat
              </button>
            </form>
          </section>

          <section className="side-stack">
            <article className="main-panel">
              <div className="section-head">
                <div>
                  <small className="section-label">Bulk upload</small>
                  <h2>CSV, XLS, atau XLSX</h2>
                </div>
              </div>

              <p className="muted-copy">
                Cocok untuk backfill data lama. Status boleh diisi dengan <code>ya</code> atau <code>tidak</code>.
              </p>

              <div className="action-row">
                <button type="button" className="ghost-button" onClick={exportTemplateWorkbook}>
                  <FileSpreadsheet size={18} />
                  Unduh template
                </button>
                <label className="primary-button">
                  <Upload size={18} />
                  Upload file
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleImport}
                    hidden
                  />
                </label>
              </div>

              <div className={`info-box ${importInfo.tone}`}>
                <strong>Status</strong>
                <p>{importInfo.message}</p>
              </div>
            </article>

            <article className="main-panel">
              <div className="section-head">
                <div>
                  <small className="section-label">Parsing PDF</small>
                  <h2>Gemini free-tier untuk pemakaian pribadi</h2>
                </div>
              </div>

              <div className="parser-grid">
                <label className="span-two">
                  API key Gemini
                  <input
                    type="password"
                    value={parserSettings.apiKey}
                    placeholder="Disimpan lokal di browser ini"
                    onChange={(event) =>
                      setParserSettings((current) => ({
                        ...current,
                        apiKey: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Model
                  <input
                    type="text"
                    value={parserSettings.model}
                    onChange={(event) =>
                      setParserSettings((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  File PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(event) =>
                      setParserState((current) => ({
                        ...current,
                        file: event.target.files?.[0] ?? null,
                        error: '',
                        parsed: null,
                      }))
                    }
                  />
                </label>
                <label className="span-two">
                  Prompt parsing
                  <textarea
                    rows="7"
                    value={parserSettings.prompt}
                    onChange={(event) =>
                      setParserSettings((current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleParsePdf}
                  disabled={parserState.loading}
                >
                  <FileText size={18} />
                  {parserState.loading ? 'Memproses PDF...' : 'Parse PDF'}
                </button>
                {parserState.parsed && (
                  <button type="button" className="ghost-button" onClick={applyParsedToForm}>
                    Gunakan hasil ini
                  </button>
                )}
              </div>

              <p className="muted-copy">
                Cocok untuk file kecil. Untuk sekarang parsing dilakukan langsung dari browser kamu ke Gemini.
              </p>

              {parserState.error && (
                <div className="info-box danger">
                  <strong>Gagal parsing</strong>
                  <p>{parserState.error}</p>
                </div>
              )}

              {parserState.parsed && (
                <div className="parsed-preview">
                  <div>
                    <span>Tanggal input Srikandi</span>
                    <strong>{parserState.parsed.tanggalInputSrikandi || '-'}</strong>
                  </div>
                  <div>
                    <span>Tanggal surat</span>
                    <strong>{parserState.parsed.tanggalSurat || '-'}</strong>
                  </div>
                  <div className="span-two">
                    <span>Hal</span>
                    <strong>{parserState.parsed.hal || '-'}</strong>
                  </div>
                  <div>
                    <span>Tujuan</span>
                    <strong>{parserState.parsed.tujuan || '-'}</strong>
                  </div>
                  <div>
                    <span>Pengonsep</span>
                    <strong>{parserState.parsed.pengonsep || '-'}</strong>
                  </div>
                  <div className="span-two">
                    <span>Catatan</span>
                    <strong>{parserState.parsed.catatan || '-'}</strong>
                  </div>
                </div>
              )}
            </article>
          </section>
        </section>
      )}

      {activeTab === 'reminders' && (
        <section className="reminder-layout">
          <article className="main-panel">
            <div className="section-head">
              <div>
                <small className="section-label">Reminder browser</small>
                <h2>Pengingat ringkas, bukan spam</h2>
              </div>
            </div>

            <div className="setting-list">
              <div className="setting-card">
                <div>
                  <strong>Izin notifikasi</strong>
                  <small>
                    Status saat ini:{' '}
                    {notificationPermission === 'unsupported'
                      ? 'browser tidak mendukung'
                      : notificationPermission}
                  </small>
                </div>
                <button type="button" className="ghost-button" onClick={requestNotificationPermission}>
                  <BellRing size={18} />
                  Izinkan
                </button>
              </div>

              <div className="setting-card">
                <div>
                  <strong>Mode reminder</strong>
                  <small>Hanya kirim ringkasan surat yang belum selesai.</small>
                </div>
                <button
                  type="button"
                  className={`switch-button ${reminderSettings.enabled ? 'is-on' : ''}`}
                  onClick={() =>
                    setReminderSettings((current) => ({
                      ...current,
                      enabled: !current.enabled,
                    }))
                  }
                >
                  {reminderSettings.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <label>
                Interval
                <select
                  value={reminderSettings.intervalHours}
                  onChange={(event) =>
                    setReminderSettings((current) => ({
                      ...current,
                      intervalHours: Number(event.target.value),
                    }))
                  }
                >
                  {REMINDER_INTERVALS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Jangan kirim mulai jam
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={reminderSettings.quietStart}
                  onChange={(event) =>
                    setReminderSettings((current) => ({
                      ...current,
                      quietStart: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Sampai jam
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={reminderSettings.quietEnd}
                  onChange={(event) =>
                    setReminderSettings((current) => ({
                      ...current,
                      quietEnd: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={sendTestNotification}
              disabled={notificationPermission !== 'granted'}
            >
              <BellRing size={18} />
              Kirim tes notifikasi
            </button>
          </article>
        </section>
      )}

      {isMobile && mobileDetailOpen && selectedLetter && (
        <div className="mobile-detail">
          <div className="mobile-detail__bar">
            <button type="button" className="ghost-button" onClick={() => setMobileDetailOpen(false)}>
              <ChevronLeft size={18} />
              Kembali
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setMobileDetailOpen(false)
                setActiveTab('letters')
              }}
            >
              <Eye size={18} />
              Ke daftar
            </button>
          </div>
          {renderDetail(selectedLetter, true)}
        </div>
      )}
    </div>
  )
}

export default App
