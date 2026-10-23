# Tugas 5 — Presentasi Web: Metaheuristik untuk Cloud Task Scheduling

Media presentasi interaktif berbasis web (HTML5/CSS3/JavaScript ES Modules) yang menyajikan teori, simulasi *live step-by-step*, dan evaluasi algoritma metaheuristik untuk *cloud task scheduling* berbasis engine **CloudSim 7.0.1** nyata dan dataset beban kerja riil **GoCJ** (Google Cloud Jobs).

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

Root folder diorganisasikan secara bersih dan modular menjadi empat folder utama:

```
task-5/
├── dataset/    # 10 file GoCJ CSV (1000 s.d. 10000 task) & file referensi
├── docs/       # Dokumen penugasan (task.md), rencana implementasi, dan 2 paper rujukan PDF
├── java/       # Backend Java (CloudSim 7.0.1), Gradle 9.6.0 wrapper, dan JUnit test suite
├── web/        # Web slides presentation (HTML, CSS, JS Native, Visualizer)
└── README.md   # Dokumentasi dan panduan penggunaan
```

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
* **Browser:** Chrome / Chromium / Edge / Firefox modern dengan dukungan ES Modules.

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
Buka browser dan arahkan ke:
👉 **`http://localhost:8080`**

* **Navigasi Slide:** Gunakan tombol **Prev** / **Next** di header, atau tombol keyboard `ArrowLeft` / `ArrowRight` (juga mendukung `Home` untuk slide 1 dan `End` untuk slide 5).
* **Slide 1:** Profil Kelompok 5 dan pengenalan topik.
* **Slide 2:** Konsep NP-Hard cloud task scheduling, trade-off eksplorasi-eksploitasi, dan diagram hierarki sumber daya.
* **Slide 3:** Teori mendalam CSA & PHS, formula, sitasi langsung ke PDF lokal di `/docs/`, dan komparasi paper vs adaptasi.
* **Slide 4:** Simulator interaktif bergaya **VisuAlgo** (Step-by-step JS generator) untuk memeriksa mutasi, kloning, dual memory, serta mode eksekusi CloudSim backend.
* **Slide 5:** Tabel evaluasi komprehensif 7 algoritma $\times$ 9 metrik hasil simulasi CloudSim 7 nyata (dilengkapi status sinkronisasi form, progress real-time, dan *allocation timeline*).

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
