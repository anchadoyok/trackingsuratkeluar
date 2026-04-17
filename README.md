# Tracking Surat Keluar

App web ringan untuk tracking surat keluar: verifikasi, tanda tangan, pengiriman, input manual, bulk upload, reminder browser, dan parsing PDF.

## Jalankan lokal

```bash
npm install
npm run dev
```

## Mode data

App ini punya 2 mode:

- `Lokal`: data disimpan di browser
- `Cloud`: data disimpan di Firestore dan bisa dibuka lintas device

Kalau env Firebase belum diisi, app otomatis jalan di mode lokal.

## Setup Firebase

1. Buat project Firebase
2. Tambahkan web app di Firebase Console
3. Aktifkan `Cloud Firestore`
4. Copy `.env.example` jadi `.env.local`
5. Isi semua nilai `VITE_FIREBASE_*`

Contoh:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_NAMESPACE=tracking-surat-pribadi
```

## Catatan Firestore

- App ini memakai client-side Firestore sync untuk web
- Namespace dipakai untuk memisahkan data app kamu
- Untuk pemakaian pribadi cepat, Firestore `test mode` paling mudah
- Untuk produksi yang lebih aman, lanjutkan dengan auth + security rules

## Deploy ke Vercel

Project ini sudah cocok untuk Vercel.

Yang perlu ditambahkan di Vercel Environment Variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_NAMESPACE`

Lalu redeploy.
