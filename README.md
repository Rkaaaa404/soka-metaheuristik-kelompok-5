# Tugas 5 — Presentasi Web: Metaheuristik untuk Cloud Task Scheduling

Media presentasi interaktif berbasis web (HTML5/CSS3/JavaScript ES Modules; animasi slide 2–8 dibuat dengan **[Remotion](https://www.remotion.dev/)** dan diputar lewat `@remotion/player`) yang menyajikan inspirasi alam, cara kerja step-by-step, lab interaktif bergaya VisuAlgo, studi kasus, dan evaluasi algoritma metaheuristik untuk *cloud task scheduling* berbasis **CloudSim 7.0.1** dan dataset riil **GoCJ** (Google Cloud Jobs).

🌐 **Live (GitHub Pages):** https://rkaaaa404.github.io/soka-metaheuristik-kelompok-5/

---

## 👥 Kelompok 5 (SOKA — Semester 5)

| NRP | Nama Anggota |
| :--- | :--- |
| **5027241002** | Balqis Sani Sabillah |
| **5027241018** | Zaenal Mustofa |
| **5027241039** | Rayka Dharma Pranandita |
| **5027241083** | Mutiara Diva Jaladitha |
| **5027241101** | Binar Najmuddin Mahya |

---

## 📂 Struktur Direktori

```
task-5/
├── .github/workflows/pages.yml   # Deploy folder web/ ke GitHub Pages
├── dataset/                      # 10 file GoCJ CSV (1000 s.d. 10000 task)
├── docs/                         # task.md, rencana, dan 2 paper rujukan (PDF)
├── java/                         # Backend Java + CloudSim 7.0.1 (Gradle) + JUnit
├── scripts/export_snapshots.py   # Ekspor hasil CloudSim nyata → web/data/results/
├── remotion/                     # Komposisi Remotion (React + TS) → di-build ke web/js/remotion/bundle.js
│   └── src/
│       ├── index.tsx             # jembatan Player ↔ JS slide (mountPlayer: seekStep, play, update, event)
│       ├── primitives/           # GeneRows (baris gen + flip/spawn), TaskGantt (task terbang antar VM), CapRow
│       └── compositions/         # lab/ (CsaRun, PhsRun) · flows/ (cara kerja) · stories/ (slide 2, 3, 4, 6)
└── web/
    ├── index.html                # 11 slide
    ├── styles.css, viz.css
    ├── js/
    │   ├── app.js                # navigasi slide + lifecycle animasi
    │   ├── api.js                # deteksi backend; fallback ke data statis
    │   ├── results.js            # slide studi kasus, evaluasi, kesimpulan
    │   ├── scenario-form.js      # form skenario CloudSim (mode live)
    │   ├── algorithms/           # CSA, PHS, decoder, RNG Mulberry32 (identik dgn Java)
    │   ├── viz/                  # story/scenes, flows, lab: kontrol + teks di sekitar player Remotion
    │   └── remotion/bundle.js    # hasil build remotion/ (tidak di-commit; dibangun CI)
    ├── data/                     # sampel task GoCJ + snapshot hasil CloudSim (1000/5000/10000)
    └── papers/                   # salinan PDF paper untuk tautan relatif
```

---

## 🎞️ Alur Slide

| # | Slide | Isi visual |
|---|---|---|
| 1 | Pengenalan | Judul, anggota Kelompok 5 |
| 2 | Masalah | Animasi antrean → penempatan asal → penempatan cerdas (Gantt per VM), kalkulator ruang solusi Mᴺ |
| 3 | Metaheuristik | Lanskap fitness: exploration vs exploitation vs seimbang |
| 4 | CSA · Inspired by nature | Animasi seleksi klonal sistem imun + pemetaan biologi ↔ scheduling |
| 5 | CSA · Cara kerja | Flowchart 6 langkah + ilustrasi operator + rumus + kartu paper (Jena, 2017) |
| 6 | PHS · Inspired by music | Animasi improvisasi jazz & poliritme 3:4 + pemetaan musik ↔ scheduling |
| 7 | PHS · Cara kerja | Flowchart 6 langkah + ilustrasi operator + kartu paper (Melnik & Trofimenko, 2015) |
| 8 | Lab interaktif | Masalah → Proses → Solusi. Algoritma dijalankan live lalu diputar sebagai video Remotion: baris jadwal bergeser saat seleksi, klon muncul dari parent, gen bermutasi berbalik warna, dan jadwal yang disorot dieksekusi sebagai Gantt (task terbang antar VM, garis makespan). ⏮ ◀ ▶ ▶\| ⏭, scrubber, kecepatan, pseudocode ter-highlight, grafik konvergensi, arsip Pareto / statistik HM, parameter bisa diubah |
| 9 | Studi kasus | CloudSim: infrastruktur 2 DC × 5 host × 5 VM, heatmap utilisasi per algoritma, timeline 1000 cloudlet, 9 metrik |
| 10 | Evaluasi | 7 algoritma × 9 metrik: bar chart per metrik + tabel lengkap (mean ± sd) |
| 11 | Kesimpulan & referensi | Takeaway dihitung dari data + 6 referensi |

Navigasi: `←`/`→`, `PageUp`/`PageDown`, `Home`/`End`, atau `#slide-N` di URL. Di Lab: `,` / `.` untuk langkah, `Space` untuk play/pause.

---

## 🧠 Algoritma yang Diimplementasikan

### 1. Metaheuristik Adaptif
* **CSA (Clonal Selection Algorithm — Adaptasi Jena TSCSA):**
  * Terinspirasi oleh sistem imun adaptif tubuh manusia.
  * *Encoding* integer diskret bebas *bit-repair*.
  * Afinitas multiobjektif terbobot (Makespan & Konsumsi Energi Host).
  * Kloning proporsional $C_r = \lfloor \beta \cdot P / r \rfloor$ dan hipermutasi terbalik (antibodi afinitas rendah bermutasi lebih agresif).
  * Pemeliharaan *Pareto Archive* untuk mencatat himpunan solusi *non-dominated*.
* **PHS (Polyrhythmic Harmony Search — Adaptasi Inventaris Tetap Melnik & Trofimenko):**
  * Terinspirasi oleh harmoni musik jazz poliritmik.
  * **Dual Harmony Memory (HM):** *Schedule HM* (urutan prioritas & alokasi VM) dan *Resource HM* (faktor kapasitas VM $0$, $0.5$, $1.0$).
  * *Seed entry* HEFT (*Heterogeneous Earliest Finish Time*) untuk menjamin konvergensi awal yang kuat.
  * Alternasi ritme genap/ganjil: improvisasi jadwal (reassign/swap) vs alokasi kapasitas resource (deactivate/activate/reduce).
  * Mekanisme *crossover* dua-titik jadwal dan *interleaving* kapasitas resource serta *repair* otomatis ke VM aktif.

### 2. Baseline Heuristik Klasik
* **FCFS (First-Come, First-Served):** Penjadwalan berurutan menurut waktu kedatangan (*release time*) ke slot paling awal bebas.
* **RR (Round Robin):** Pembagian task bergiliran secara seimbang antar VM.
* **SJF (Shortest Job First):** Non-preemptive event list; memilih task terpendek yang sudah tiba ke VM dengan waktu penyelesaian tercepat.
* **Min-Min:** Secara inkremental memprioritaskan task dengan waktu selesai minimum tercepat lintas seluruh mesin.
* **Max-Min:** Secara inkremental memprioritaskan task besar dengan waktu selesai maksimum tercepat lintas seluruh mesin.

---

## 📊 9 Metrik Evaluasi Kinerja

| Metrik | Definisi & Satuan | Arah Lebih Baik |
| :--- | :--- | :---: |
| **Makespan** | Waktu selesai task terakhir sejak awal epoch ($T = \max f_i$), detik | $\downarrow$ Rendah |
| **Avg Waiting Time** | Rata-rata waktu antre task di broker ($\text{mean}(s_i - a_i)$), detik | $\downarrow$ Rendah |
| **Avg Execution Time** | Rata-rata durasi eksekusi aktif task ($\text{mean}(d_i)$), detik | $\downarrow$ Rendah |
| **Avg Turnaround Time** | Rata-rata waktu siklus dari kedatangan hingga selesai ($\text{mean}(f_i - a_i)$), detik | $\downarrow$ Rendah |
| **Throughput** | Jumlah task yang terselesaikan per satuan waktu ($N / T$), task/detik | $\uparrow$ Tinggi |
| **Resource Utilization** | Rata-rata utilisasi VM relatif terhadap total inventaris ($100 \times \frac{\text{mean } L_j}{T}$), % | $\uparrow$ Tinggi |
| **Degree of Imbalance (DI)** | Tingkat ketimpangan beban kerja antar VM ($\frac{\max L_j - \min L_j}{\text{mean } L_j}$) | $\downarrow$ Rendah |
| **Total Cost** | Biaya pemakaian CPU berdasarkan tarif CloudSim ($0.01\text{ G\$/detik}$), G\$ | $\downarrow$ Rendah |
| **Scheduling Time** | Waktu komputasi algoritma dalam merancang jadwal, milidetik | $\downarrow$ Rendah |

---

## 🚀 Panduan Menjalankan Aplikasi

### Prasyarat
* **Java Development Kit (JDK):** Versi 21 atau lebih tinggi (mendukung JDK 25).
* **Node.js** 20+ (untuk mem-build animasi Remotion).
* **Browser:** Chrome / Chromium / Edge / Firefox modern dengan dukungan ES Modules.

### 0. Build animasi Remotion (wajib sekali, dan setiap mengubah `remotion/`)

```powershell
cd remotion
npm ci
npm run build      # → web/js/remotion/bundle.js
npm run studio     # opsional: Remotion Studio untuk melihat/scrub tiap komposisi
```

Tanpa `bundle.js`, slide tidak bisa dimuat. File ini tidak di-commit; workflow Pages membangunnya otomatis.

### 1. Menjalankan Backend & Slide Presentasi
Jalankan perintah berikut melalui terminal (PowerShell atau Command Prompt) dari folder `java/`:

```powershell
cd java
.\gradlew.bat run
```

Atau jalankan distribusi terkompilasi langsung:
```powershell
.\java\build\install\cloud-scheduling\bin\cloud-scheduling.bat --port=8080
```

### 2. Mengakses Presentasi

* **Lokal + backend:** buka `http://localhost:8080`. Badge header menampilkan **● Backend CloudSim live**; di slide 9 tombol *Jalankan CloudSim live* menjalankan simulasi nyata dengan konfigurasi bebas (task, DC, host, distribusi VM, run, seed, parameter CSA/PHS).
* **GitHub Pages / server statis:** badge menampilkan **○ Snapshot CloudSim**. Algoritma di slide 2–8 tetap dihitung live di browser. Slide 9–11 memakai snapshot hasil CloudSim **nyata** (`web/data/results/`, 5 run × 7 algoritma, seed 42) untuk 1000, 5000, dan 10000 task.
* Uji mode statis secara lokal: `python -m http.server 8000 -d web` → `http://localhost:8000`.

### Memperbarui snapshot CloudSim

```powershell
cd java; .\gradlew.bat run          # terminal 1
python scripts/export_snapshots.py  # terminal 2 (default: 1000,5000,10000 task · 5 run)
```

Skrip memanggil `/api/simulate`, menunggu job selesai, lalu menulis `web/data/results/gocj-<N>.json` + `index.json`. Alokasi per-cloudlet hanya disimpan untuk skenario terkecil agar situs tetap ringan; skenario lain menyimpan ringkasan per VM.

### Deploy GitHub Pages

Workflow `.github/workflows/pages.yml` mem-build `remotion/` lalu men-deploy folder `web/` setiap push ke `main`. Sekali saja: **Settings → Pages → Source: GitHub Actions**.

### Catatan skenario

Distribusi VM diterapkan **per host** (2 Small / 2 Medium / 1 Large per host → 25 VM per DC, 50 VM total). Ini perluasan dari skenario minimal `docs/task.md` §6.3 (5 VM per DC) agar beban 1000–10000 job tidak menumpuk di 10 VM. Semua path di web bersifat relatif sehingga situs berjalan di sub-path Pages.

### 3. Catatan eksperimen lokal

Setiap eksperimen baru menyimpan hasil secara otomatis:

```text
java/build/results/<jobId>/metrik.csv
java/build/results/<jobId>/status.json
```

Lokasi absolut CSV ditampilkan di slide 9 (setelah run live) dan respons API `result.exports.metricsCsv`. Tidak perlu mengunduh melalui browser; file sudah berada di komputer yang menjalankan backend. Satu baris CSV mewakili satu algoritma × satu run, berisi sembilan metrik, seed, dataset/hash SHA-256, engine/version, timestamp, serta konfigurasi lengkap dalam kolom `scenarioJson`. Nama metrik mengikuti API; satuan tercantum pada tabel metrik di atas.

CSV ditulis dan di-flush setelah setiap run CloudSim selesai. Hasil parsial tetap disimpan ketika eksperimen gagal atau timeout; periksa `status.json`: hanya `status: SUCCEEDED` dan `complete: true` menandakan seluruh eksperimen selesai. Setiap job memakai direktori berbeda, tidak menimpa eksperimen sebelumnya. Cache default yang dibaca ulang bukan run baru dan tidak menghasilkan CSV baru.

Kolom energi tambahan memiliki `energySource=decoded-schedule-estimate`: energi tersebut merupakan estimasi decoder, **bukan pengukuran energi CloudSim**. Sembilan metrik evaluasi berasal dari jalur simulasi CloudSim; scheduling time mengukur waktu komputasi scheduler.

Verifikasi: `gradlew test` lulus (14 test). Mode statis & live diuji headless (Edge) di 1366×768 dan 390 px tanpa error JS; run live FCFS/RR/PHS menghasilkan makespan identik dengan snapshot (seed 42).

---

## 🧪 Menjalankan Pengujian (JUnit 5)

Seluruh kontrak fisik CloudSim, semantik non-preemptive, determinisme RNG Mulberry32, dan validasi input diuji secara otomatis:

```powershell
cd java
.\gradlew.bat test
```

Laporan pengujian lengkap akan dibuat di:
`java/build/reports/tests/test/index.html`

---

## 🌐 HTTP API Endpoints

Backend Java mengekspos endpoint RESTful JSON:

* `GET /api/datasets` — Daftar 10 dataset GoCJ beserta jumlah baris dan SHA-256.
* `GET /api/datasets/{filename}/tasks?limit=N` — Mengambil subset $N$ task pertama (1 s.d. 30) untuk visualisasi live JS.
* `POST /api/simulate` — Memvalidasi skenario dan memicu proses anak simulasi CloudSim (HTTP 202 dengan `jobId`). Menolak *concurrent job* dengan HTTP 409 `SIMULATION_BUSY`.
* `GET /api/simulations/{jobId}` — Polling status dan *progress* simulasi (`RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`).
* `GET /api/default-result` — Mengambil hasil simulasi skenario default dari cache atomik (`java/build/results/default.json`) atau menjalankannya otomatis jika belum tersedia.
* `GET /docs/{filename}` — Mengakses file referensi paper PDF (`Clonal Selection Algorithm (CSA).pdf` dan `Polyrhythmic Harmony Search.pdf`).
