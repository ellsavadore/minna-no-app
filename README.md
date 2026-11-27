# みんなを愛している (Minna wo Aishiteiru)

Website flashcard fukushu untuk Kotoba, Kanji, dan Pola Kalimat (Bunpou) level A1, A2.1, A2.2.
Materi diambil dari buku IRODORI ©The Japan Foundation (Daftar Kosakata + Bab 1–18).

- `public/` — aplikasi (HTML/CSS/JS) dan data kartu `public/data/*.json`
- `api/` — fungsi Vercel: pendaftaran siswa, sinkron progres, dashboard admin, target harian
- Penyimpanan: Vercel Blob (env `BLOB_READ_WRITE_TOKEN`), password admin di env `ADMIN_PASSWORD`
- Admin: buka `/#admin`
