# Rencana Implementasi Presentasi Cloud Task Scheduling

## Context
Bangun lima bagian presentasi web berbahasa Indonesia sesuai `task.md`: pengenalan Kelompok 5, konteks metaheuristik, teori CSA/PHS dari PDF lokal, visualisasi algoritma live serta simulasi CloudSim, dan evaluasi tujuh algoritma dengan sembilan metrik nyata. Satu perintah Gradle menjalankan backend Java sekaligus menyajikan HTML/CSS/JavaScript pada `http://localhost:8080`. Presentasi memakai gaya akademik visual: latar terang, diagram jelas, rumus ringkas, detail teknis dalam panel.

## Dasar keputusan terverifikasi
- Repo belum mempunyai aplikasi/build; hanya `task.md`, dua PDF, sepuluh CSV GoCJ, dan dua TXT referensi. Semua jalur implementasi di bawah adalah **berkas baru yang direncanakan**, bukan kode yang sudah ada. Tidak ada utilitas lokal yang dapat digunakan ulang.
- Audit read-only sepuluh CSV menemukan N baris sesuai nama file, tiga kolom, length positif, SLA 1–3, arrival nonnegatif dan tidak menurun. Baris 4986 file 5000 adalah `83000,2,4987`. `DATA_CORRECTIONS.md` tidak ditemukan setelah listing lengkap dan pencarian; jangan mengklaim pernah membacanya atau mengarang riwayat koreksi. SHA-256 file default 1000: `724d91fbe38a327a4d62ab0c224af9535cd45c56b6c788fe98d28647ad2284f5`.
- JDK 25 tersedia; Gradle tidak ada pada PATH. [Matriks resmi Gradle](https://docs.gradle.org/current/userguide/compatibility.html) mendukung runtime Java 25 mulai 9.1.0.
- Gunakan **CloudSim asli 7.0.1**, bukan CloudSim Plus. [POM modul JitPack](https://jitpack.io/com/github/Cloudslab/cloudsim/cloudsim/7.0.1/cloudsim-7.0.1.pom) mengonfirmasi koordinat `com.github.Cloudslab.cloudsim:cloudsim:7.0.1`. [POM upstream](https://raw.githubusercontent.com/Cloudslab/cloudsim/7.0.1/pom.xml) mensyaratkan Java 21. [Contoh resmi](https://raw.githubusercontent.com/Cloudslab/cloudsim/7.0.1/modules/cloudsim-examples/src/main/java/org/cloudbus/cloudsim/examples/CloudSimExample1.java) memakai `submitGuestList`, `setGuestId`, dan `getExecFinishTime`; jangan menyalin API lama secara buta.
- Paper CSA: R. K. Jena, *Energy Efficient Task Scheduling in Cloud Environment*, Energy Procedia 141 (2017), 222–227, DOI [10.1016/j.egypro.2017.11.096](https://doi.org/10.1016/j.egypro.2017.11.096). TSCSA asli memakai encoding biner, objective energi/makespan, selection–cloning–mutation dan Pareto archive. Detail operasional tidak lengkap menurut §5 sendiri.
- Paper PHS: Melnik & Trofimenko, *Polyrhythmic Harmony Search for Workflow Scheduling* (2015), hlm. 468–475, DOI [10.1016/j.procs.2015.11.053](https://doi.org/10.1016/j.procs.2015.11.053). Dua memory heterogen, schedule dan resource, merupakan pembeda penting; bukan HS satu vektor dengan HMCR/PAR.
- Rumus tertentu pada kedua PDF rusak dalam ekstraksi teks; renderer PDF lokal tidak tersedia. Jangan menyalin rekonstruksi sebagai rumus verbatim paper. Rumus operasional dalam rencana ini sengaja ditandai adaptasi; pembahasan paper memakai konsep dan operator yang terbaca.

## Approach

### 1. Jalankan aplikasi dan tetapkan kontrak data bersama
Buat `settings.gradle`, `build.gradle`, Gradle Wrapper 9.1.0 lengkap termasuk JAR, dan package `id.ac.soka.scheduling` di `src/main/java/`. Gunakan plugin `application`, Java release 21 dengan JDK 25 yang tersedia, dependency CloudSim di atas melalui Maven Central + JitPack, Jackson Databind 2.18.2 untuk JSON, dan JUnit Jupiter 5.11.3 untuk pemeriksaan perilaku. Entry point `App.main(String[] args)` menjalankan `com.sun.net.httpserver.HttpServer` di loopback port 8080; `--port=N` boleh mengubah port. Static assets dari `src/main/resources/web/`; tidak memerlukan Node, bundler, CDN, atau server frontend kedua.

`gradlew.bat run` harus cukup di Windows; `./gradlew run` padanannya. Bootstrap wrapper sekali saat implementasi menggunakan distribusi resmi Gradle 9.1.0 dengan checksum resmi, karena Gradle sistem belum tersedia. Jangan commit dependency JAR selain wrapper.

Buat model bersama dalam `model/`:
- `TaskSpec(int id, long lengthMi, int sla, double arrivalTime)`; ID = nomor baris dikurangi satu.
- `VmSpec(int id, int datacenterIndex, int hostIndex, String type, double nominalMips, int pes, int ramMb, long bandwidth, long storageMb)`.
- `SchedulePlan(int[] taskOrder, int[] assignedVm, double[] capacityFactors)`; indeks assignment adalah task ID, faktor per VM `0`, `0.5`, atau `1`. Faktor nol berarti tidak dipakai untuk scheduling, bukan VM inventaris dihapus.
- `Scheduler.schedule(List<TaskSpec> tasks, List<VmSpec> vms, AlgorithmOptions options, long seed)` mengembalikan `SchedulePlan`. Jadwal lengkap harus memuat semua task tepat sekali, assignment valid dan hanya ke VM aktif.
- Algoritma pada JSON: persis `CSA`, `PHS`, `FCFS`, `RR`, `SJF`, `MinMin`, `MaxMin`.

Request `POST /api/simulate` menambahkan pemilihan dataset pada usulan task.md:
```json
{
  "dataset": "GoCJ_Dataset_1000.csv",
  "algorithms": ["CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin"],
  "taskCount": 1000,
  "datacenters": 2,
  "hostsPerDatacenter": 5,
  "vmsPerDatacenter": 5,
  "vmDistribution": {"small": 2, "medium": 2, "large": 1},
  "runs": 5,
  "seed": 42,
  "csa": {"population": 30, "selected": 10, "generations": 200, "beta": 1, "timeWeight": 0.5},
  "phs": {"memorySize": 10, "iterations": 200, "improvisations": 3}
}
```
Field `dataset`, `runs`, `seed`, `csa`, `phs` boleh tidak dikirim dan memakai nilai di atas; field skenario lainnya wajib. Semua nilai efektif dikembalikan. Tolak field asing, algoritma tidak dikenal/duplikat/list kosong, bilangan tidak finite, pecahan pada field integer, distribusi negatif/tidak cocok, dan dataset selain whitelist sepuluh file. Batas demo: taskCount 1..ukuran file; datacenter 1..10; host/DC 1..50; VM/DC 1..100; runs 1..10; seed uint32; population 2..100; selected 1..population; generations/iterations 1..10000; beta (0,5]; timeWeight [0,1]; memorySize 2..50; improvisations 1..10. Frontend menampilkan batas tersebut, backend menegakkannya. Jangan diam-diam memotong task/run/iterasi.

Buat `data/GoCjRepository.java`: baca UTF-8 tanpa header, tiga kolom CSV, length integer positif, SLA integer 1–3, arrival finite >=0 dan tidak menurun. Gunakan tepat N baris pertama file terpilih, bukan file berbeda hanya karena N sama. File kosong/rusak/tidak ditemukan menghasilkan error yang menyebut nama file dan baris bila relevan; tidak ada data sintetis pengganti. Metadata dataset mengandung jumlah baris dan SHA-256 seluruh file.

### 2. Bangun model waktu/resource dan jalur CloudSim nyata
Buat `simulation/ScenarioFactory.java`, `ScheduleDecoder.java`, `ArrivalBroker.java`, `CloudSimRunner.java`, dan `MetricsCalculator.java`. Ini fondasi bersama sebelum algoritma dan UI; satu fixture tangan harus dapat dieksekusi nyata melalui CloudSim pada akhir langkah ini.

**Infrastruktur tetap:** spesifikasi Small/Medium/Large persis task.md §6.3 (MIPS per PE 500/1000/2000, PE 1/2/4, RAM 512/1024/2048, BW 500/1000/1000, storage masing-masing 10000). ID VM berurutan lintas DC; dalam DC urut Small, Medium, Large. Host masing-masing 16 PE × 4000 MIPS, RAM 32768 MB, BW 10000 Mbps, storage 1000000 MB. Placement deterministik first-fit menurut host ID dalam **DC yang diminta**, dengan reservasi PE/RAM/BW/storage nominal; tidak melakukan spillover ke DC lain. Gunakan VM scheduler tanpa oversubscription dan policy placement eksplisit. Tolak konfigurasi yang tidak muat dengan 422 `INSUFFICIENT_CAPACITY`, sebelum optimasi. Host kosong tetap dibuat.

**Model beban:** setiap baris GoCJ adalah task independen, non-preemptive, satu PE. Arrival adalah detik dari epoch workload. Tidak mengarang DAG, deadline, bobot SLA, transfer network atau dependensi antarjob. Cloudlet memakai `UtilizationModelFull`, file/input output minimum 1 byte, tanpa required files/transfer delay. Satu PE menjalankan satu task; VM multi-PE dapat menjalankan beberapa task sekaligus. Durasi analitis task `lengthMi / effectiveMips`, **bukan** `lengthMi / (mips * pes)`.

**Decoder bersama:** candidate berisi priority permutation dan assignment. Event loop per VM menggunakan task yang sudah tiba, urutan priority dalam `taskOrder`, dan PE bebas paling kecil indeksnya. Jika tidak ada ready task, maju ke arrival berikutnya; jangan membuat VM idle hanya karena kandidat berpriority tinggi belum datang. Completion pada timestamp yang sama diproses sebelum dispatch; seluruh arrival pada timestamp itu dimasukkan sebelum memilih task berikutnya. Prediksi menyimpan start/finish per task. Gunakan heap/array primitive yang dapat dipakai ulang untuk evaluasi banyak kandidat; jangan membuat CloudSim untuk setiap fitness.

**Eksekusi nyata:** `ArrivalBroker` mempertahankan ready queue dan slot PE, mengirim cloudlet ke datacenter hanya saat task sudah datang dan PE tersedia, lalu mendispatch berikutnya saat `CLOUDLET_RETURN`. Antrean VM tidak boleh mengubah prioritas broker. Subclass broker harus mengganti perilaku submit/termination default: sumber upstream menutup simulasi bila tidak ada cloudlet in-flight, padahal task masa depan masih mungkin ada. Selesai hanya setelah seluruh N task berhasil; kegagalan VM/task membatalkan hasil, bukan menampilkan metrik parsial sebagai sukses. Buat semua VM di DC yang dipilih dan tunggu ACK lengkap. Definisikan epoch workload sesudah seluruh VM siap; jadwalkan arrival relatif epoch dan kurangi epoch dari timestamp hasil agar waktu inisialisasi tidak menjadi waiting time.

CloudSim 7 memakai global state; seluruh algorithm × run dalam satu job dijalankan serial, reset melalui `CloudSim.init` dan buat objek baru setiap run. Bekukan calendar awal untuk repeatability. Framework menghasilkan start, finish, CPU time dan DC/VM aktual; API tidak boleh mengembalikan hasil decoder sebagai hasil CloudSim.

**PHS inventaris vs pemakaian:** buat jumlah/tipe VM nominal persis panel untuk semua algoritma. Untuk PHS, VM aktif mempunyai MIPS nominal × faktor 0.5 atau 1 saat konstruksi; VM dengan faktor 0 tetap dialokasikan nominal tetapi tidak diberi task. RAM/PE/BW/storage tidak berubah. Reservasi nominal dan placement sama untuk seluruh algoritma. Laporkan `nominalMips`, `effectiveMips`, `enabled`, dan host/DC setiap VM. Tidak membuat VM MIPS nol. Seluruh baseline dan CSA menggunakan faktor 1.

**Objective energi CSA (adaptasi, bukan angka paper):** host selalu menyala, idle 100 W dan max 200 W; `u_h(t) = sum(effectiveMips task yang sedang berjalan)/(16*4000)`, `P_h(t)=100+100*u_h(t)`. Integralkan dari t=0 workload sampai task terakhir selesai; jumlahkan semua host, termasuk kosong. Evaluator memakai timeline prediksi, detail hasil menggunakan timeline CloudSim. Energi Joule adalah detail tambahan CSA, bukan pengganti sembilan metrik.

### 3. Implementasikan lima baseline dengan kebijakan yang tidak ambigu
Buat `algorithm/BaselineSchedulers.java`, reuse decoder/slot model langkah 2. Semua tie-break terakhir task ID lalu VM ID lalu PE index. Seluruh baseline melihat workload yang sama dan mengetahui panjang/arrival (mode eksperimen offline, bukan klaim online scheduler).
- FCFS: proses task `(arrival, id)`; tempatkan task berikut pada slot dengan start feasible paling awal `max(arrival, slotFree)`, tie VM/PE ID. Ini dibedakan dari RR dan tidak menggunakan completion time untuk memilih VM.
- RR: urutan `(arrival, id)`, assignment `index % totalVm`, priority FCFS.
- SJF: event-list scheduling non-preemptive; pada setiap kesempatan dispatch pilih task terpendek dari yang sudah datang, lalu di antara slot yang **sedang bebas** pilih VM dengan earliest finish untuk task itu; jika semua sibuk/ready kosong maju ke event berikutnya. Task belum tiba tidak mendahului ready task. Simpan urutan keputusan sebagai permutation.
- MinMin/MaxMin: bangun jadwal secara incremental. Untuk tiap task belum terjadwal hitung minimum feasible completion di seluruh slot VM, `max(arrival, slotFree)+length/mips`. MinMin memilih minimum nilai minimum tersebut; MaxMin memilih maksimum. Commit pasangan task-slot dan update ketersediaan. Ini varian statik dengan release times; urutan hasil menjadi priority permutation, kemudian decoder menentukan jadwal feasible final (tanpa artificial idle menunggu task yang belum tiba). Tampilkan label kebijakan ini pada penjelasan metode.
- MinMin/MaxMin memakai array primitive cache `bestCompletion[task]`, `bestVm[task]`, `bestPe[task]`, `scheduled[task]`. Inisialisasi minimum semua task. Setiap commit, scan task tersisa untuk memilih minimum/maksimum cache dengan tie task ID; update slot VM terpilih. Recompute minimum lintas VM hanya untuk task tersisa yang `bestVm`-nya adalah VM yang berubah; minimum task lain tetap sah karena ketersediaan resource hanya bergerak maju. Scan PE per VM untuk menemukan slot bebas paling awal, tie PE index. Ini menghindari evaluasi ulang seluruh matriks tanpa membuat heap lazy yang salah untuk MaxMin. Implementasi referensi tanpa cache hanya untuk fixture kecil; hasil assignment/priority kedua versi harus identik. Jalur produksi tidak melakukan sampling task.

### 4. Implementasikan CSA sesuai mekanisme paper dengan adaptasi eksplisit
Buat `algorithm/CsaScheduler.java`. Nama tampilan: **CSA — adaptasi TSCSA Jena**. Paper PDF hlm. 3–4 menjelaskan model waktu/energi, encoding biner dan Pareto; slide membedakan fakta tersebut dari pelengkapan berikut.

Gunakan satu gen integer `assignedVm[taskId]` agar mapping VM diskret tidak memerlukan bit repair; priority `(arrival,id)`, resource semua penuh. Ini adaptasi encoding biner paper. Tidak membuat crossover atau immigrant. Default P=30, K=10, beta=1, 200 generasi; populasi awal seluruhnya random uniform VM. Hitung referensi positif `Tref,Eref` dari RR pada skenario yang sama sebelum optimasi; konstan selama run. `T=max finish`, `F=w*T/Tref+(1-w)*E/Eref`, affinity `1/(1+F)`, default w=0.5. Rumus affinity ini **adaptasi**, bukan persamaan (6) paper.

Setiap generasi: urut F naik dengan candidate-ID stabil sebagai tie-break; pilih K parent. Parent rank r (1-based) menghasilkan `max(1,floor(beta*P/r))` clone. Mutasi per gen pada clone dengan `pmin=1/N`, `pmax=min(1,5/N)`, `p_r=pmin+(pmax-pmin)*(r-1)/(K-1)`; bila K=1 gunakan pmin. Gen terpilih diganti ke VM lain secara uniform; bila hanya satu VM tidak ada perubahan. Parent asli tidak dimutasi. Evaluasi clone, pilih P survivor terbaik dari parent+clone, dan update archive nondominated `(T,E)` sepanjang run; satu wakil untuk pasangan objective sama, tie candidate-ID. Ambil anggota archive F minimum sebagai hasil setelah tepat G generasi. Archive menyimpan assignment hanya bagi anggota yang bertahan; jangan menyalin seluruh populasi ke trace backend.

Evaluasi seluruh populasi awal dan masukkan solusi nondominated ke archive sebelum generasi pertama. Kandidat mendapat ID monoton dalam urutan pembentukan. Seluruh loop gen/VM menggunakan ID menaik; uniform VM lain memilih indeks pada daftar VM valid berurutan, bukan rejection loop.

Pertahankan best-so-far F, T, E, jumlah evaluasi dan archive; tidak mengklaim makespan/energi masing-masing selalu turun atau CSA pasti menang. Pengaturan P/K/G/beta/w tersedia dalam advanced panel kedua slide; mutation formula ditampilkan read-only.

### 5. Implementasikan PHS dengan dua memory dan batas inventaris yang disetujui
Buat `algorithm/PhsScheduler.java`. Nama tampilan: **PHS — adaptasi inventaris tetap**. HM schedule berisi `(taskOrder,assignedVm)`; HM resource berisi capacityFactors. Setiap entry juga menyimpan pasangan pendamping lengkap beserta fitness yang benar-benar dievaluasi. Dilarang menganggap fitness komponen masih valid ketika pasangan berubah.

Objective PHS `T=max finish` (makespan), bukan affinity multiobjektif CSA. Default 10 entry per HM, 200 iterasi dan 3 improvisation per iterasi. Paper menggunakan HM 10 dan 10000 iterasi; 200 adalah budget demo yang dapat diubah, bukan angka paper. Bentuk seed **HEFT untuk DAG tanpa edge**: prioritas descending mean execution time lintas VM nominal, tie task ID; tempatkan tiap task pada earliest-finish slot menghormati arrival. Seed entry memakai semua resource penuh; entry lain random permutation, assignment dan resource. Initialization resource: pilih active set uniform melalui coin per VM, pastikan set tidak kosong dengan mengaktifkan ID terkecil bila perlu; active factor uniform 0.5/1.

Bentuk seed lengkap yang sama sebagai entry 0 kedua HM. Untuk entry i berikutnya, bangkitkan resource dahulu (loop VM ID menaik), kemudian permutation Fisher–Yates dari N-1 turun ke 1 dan assignment uniform ke daftar VM aktif (loop task ID menaik); simpan pasangan yang sama pada entry i kedua HM. Evaluasi pasangan ini sebelum masuk HM. Random schedule ketika improvisation dimulai dibangkitkan terhadap semua VM nominal, lalu repair setelah dipasangkan dengan resource aktual. Setiap gabungan dua komponen, bukan hanya operator deactivate, harus menjalani repair sebelum evaluasi.

Setiap iterasi bangkitkan schedule dahulu, lalu resource; untuk masing-masing ambil `floor(u*3)` dengan cabang 0=random, 1=copy, 2=crossbreed (pelengkapan paper). Copy memilih entry uniform. Crossbreed membentuk parent A acak baru dahulu, kemudian memilih parent B dari HM secara uniform:
- Schedule: pilih dua boundary berbeda uniform dari 0..N, urutkan menjadi low/high; gunakan bagian luar parent A, isi bagian tengah dengan urutan task belum terpakai dari parent B; assignment dibawa parent penyumbang task. Untuk N=1, crossover menjadi copy A tanpa menarik cut point. Tidak boleh hilang/duplikat task.
- Resource: daftar VM aktif setiap parent berurutan ID menaik; kunjungi A lalu B bergantian sampai keduanya habis (lanjut parent yang tersisa jika satu habis), abaikan VM duplikat setelah kemunculan pertama; faktor mengikuti donor. Budget total `TC=sum(nominalMips*pes)` dan batas tiap VM nominal, bukan angka TC=80/MRC=30 eksperimen paper. Jika penambahan melampaui TC, turunkan faktor ke tingkat legal berikutnya yang muat, atau lewati jika tidak ada; dengan inventaris unik dan batas nominal kasus berlebih normalnya tidak terjadi. Jika kosong aktifkan VM ID terkecil pada faktor 1. Jelaskan bahwa clipping/interleaving paper dibatasi oleh inventaris dalam adaptasi ini.

Pilih ritme schedule pada iterasi genap (mulai 0), resource pada ganjil. Hanya ritme itu yang diimprovisasi, sebanyak jumlah yang ditentukan:
- Schedule: peluang 1/2 reassign satu task ke VM aktif lain, atau 1/2 swap dua posisi permutation; bila alternatif tidak ada, langkah dicatat tanpa perubahan.
- Resource: pilih uniform dari operator yang legal: deactivate salah satu VM aktif jika aktif>1; activate VM nonaktif pada faktor 1; reduce VM faktor 1 menjadi 0.5. Jika tidak ada operasi legal, catat tanpa perubahan.
- Repair mengunjungi task menurut `(arrival,id)` dengan tabel slot bebas sementara yang mula-mula nol. Assignment valid dipertahankan dan slot paling awalnya direservasi. Assignment yang menunjuk VM nonaktif dipindahkan ke slot aktif dengan nilai `max(arrival,free)+length/effectiveMips` terkecil, tie VM/PE ID; reserve slot tersebut. Hanya assignment invalid diubah. Setelah repair, decoder priority sesungguhnya menentukan fitness.
- Evaluasi probe lengkap sesudah rangkaian improvisation. Ganti entry terburuk **hanya di HM ritme terpilih**, dan hanya jika makespan lebih kecil; tie tidak mengganti. Entry menyimpan pasangan aktual, bukan sekadar komponen. Best complete solution dilacak independen kedua HM. Return pasangan terbaik setelah tepat iteration budget.

Adaptasi ini membatasi ruang resource asli; pada workload independen menurunkan kapasitas mungkin tidak menguntungkan. Laporkan apa adanya, jangan merekayasa kemenangan PHS. Tetap simulasikan resource hasil akhir nyata di CloudSim.

### 6. Hitung sembilan metrik dan hasil eksperimen yang dapat ditelusuri
Gunakan timestamp CloudSim relatif epoch workload. Untuk task i: a=arrival, s=start, f=finish, d=actual CPU time. Semua task harus SUCCESS dan berjumlah N. Definisikan `T=max f` dari epoch 0 (bukan max f minus arrival pertama); tampilkan definisi agar periode sebelum arrival pertama tidak tersembunyi.

| Field API | Definisi dan satuan |
|---|---|
| `makespan` | T, detik |
| `averageWaitingTime` | mean(s-a), detik; jangan memakai waktu tunggu internal cloudlet saja karena ready queue berada di broker |
| `averageExecutionTime` | mean(d), detik |
| `averageTurnaroundTime` | mean(f-a), detik; label “Turnaround (submit → selesai)”, bukan response time klasik submit→mulai |
| `throughput` | N/T, task/detik |
| `resourceUtilization` | 100 × mean_j(sum durasi task VM j/(PE_j*T)); seluruh VM inventaris masuk penyebut, VM tidak dipakai bernilai 0 |
| `degreeOfImbalance` | (max L_j-min L_j)/mean L_j, L_j=sum durasi task VM j/PE_j; termasuk VM idle |
| `totalCost` | sum_i(actualCPUTime_i * cloudlet.getCostPerSec()), unit G$ |
| `schedulingTime` | wall-clock `System.nanoTime` sekitar keseluruhan scheduler termasuk initialization/evaluator, tetapi bukan parsing, CloudSim atau HTTP; milidetik |

Tarif seluruh DC `costPerSecond=0.01 G$/CPU-second`, memory/storage/bandwidth cost=0. Ini model biaya eksperimen, bukan tarif provider nyata. Set melalui `DatacenterCharacteristics`; baca tarif CloudSim aktual saat menghitung. Sumber `Cloudlet.java` 7.0.1 menunjukkan `getProcessingCost()` tidak menjumlahkan CPU cost, jadi jangan mengandalkannya untuk total cost. Dilarang menambal library atau menyembunyikan nol lewat angka manual yang tidak terkait run.

Untuk setiap run r=0..runs-1 gunakan `runSeed=(seed+r) mod 2^32`. Implementasikan RNG Mulberry32 identik Java/JS (uint32 overflow, konstanta `0x6D2B79F5`, operasi xor/unsigned shift/imul seperti definisi Mulberry32; output uint32/4294967296); integer uniform via floor(u*n). Seed dicatat per run. Baseline dijalankan ulang juga agar scheduling time benar-benar terukur, tidak meng-copy satu hasil. Mean biasa dan sample SD denominator runs-1; runs=1 mengembalikan SD 0 dan UI menyebut n=1. Scheduling time tidak dijamin identik meskipun seed sama.

Definisi RNG bersama (Java memakai int overflow dan unsigned shifts; JS memakai `Math.imul` untuk imul): `state=(state+0x6D2B79F5) mod 2^32; t=imul(state xor (state>>>15), state|1); t=t xor (t+imul(t xor (t>>>7),t|61)); return unsigned(t xor (t>>>14))/4294967296`. Pilihan boolean memakai `u<0.5`; pemilihan anggota memakai urutan ID/index menaik; pengambilan dua indeks berbeda memakai satu indeks pertama, lalu indeks kedua dari domain n-1 dan melompati indeks pertama. Tie entry HM terburuk memilih index terkecil; best lengkap dengan fitness sama mempertahankan solusi lebih dahulu.

Result JSON berisi `scenario`, `provenance` (engine/version, dataset SHA256, waktu UTC, revision model `gocj-v1`, parameter dan seed), serta `results[]` dengan `algorithm`, `metrics` (sembilan key masing-masing `{mean,stddev,unit}`), `runMetrics[]` (runIndex,seed,metrics,energyJ), dan `representativeRun` (runIndex=0, seed, `vms[]`, `allocations[]`). Setiap allocation berisi taskId, vmId, datacenterIndex, hostIndex, arrival, start, finish, cpuTime, sla. UI menandai bahwa alokasi adalah run pertama, bukan jadwal rata-rata. Hasil trace optimasi hanya detail/convergence, tidak dicampur dengan metrik CloudSim.

### 7. Ekspos job HTTP, progress, timeout dan baseline default
Buat `api/SimulationHttpApi.java`, `simulation/SimulationJobService.java`, `SimulationWorker.java`. Proses server tidak menjalankan CloudSim di thread handler. Satu job aktif maksimum; job menjalankan child JVM dengan classpath aplikasi yang sama dan mode `--worker`, request JSON lewat stdin, event NDJSON stdout (`progress`, `result`, `error`); log CloudSim dialihkan ke stderr. Jalankan algorithm×runs serial di worker. Batasi 900 detik wall-clock untuk keseluruhan job, hentikan proses anak pada timeout/shutdown, status `TIMED_OUT`. Ini menghindari global state antarpengguna sekaligus memberi timeout yang benar, bukan sekadar membatalkan browser sementara simulasi tetap hidup.

Endpoints:
- `GET /api/datasets`: daftar whitelist, rowCount, sha256; `GET /api/datasets/{filename}/tasks?limit=N` menyediakan N pertama, 1..30, untuk demo JS.
- `POST /api/simulate`: validasi lalu 202 `{jobId,status:"RUNNING"}`. Job lain aktif → 409 `SIMULATION_BUSY` tanpa antrean tak terbatas.
- `GET /api/simulations/{jobId}`: 200 `{jobId,status,completedRuns,totalRuns,currentAlgorithm,currentRun,result,error}`. Status `RUNNING|SUCCEEDED|FAILED|TIMED_OUT`; result hanya saat sukses, error hanya gagal/timeout. Progress dihitung dari run benar-benar selesai, bukan timer palsu; UI boleh menunjukkan iterasi aktif sebagai detail.
- `GET /api/default-result`: 200 result default valid dari cache; jika belum ada mulai job default dan 202 jobId; jika job lain aktif berikan 409 agar UI tetap menampilkan keadaan sibuk. Frontend dapat mengulang setelah job selesai, tidak menjalankan default serentak.
- Error HTTP konsisten `{error:{code,message,fields}}`: 400 malformed/validation, 404 route/job/dataset asing, 422 kapasitas tidak muat, 500 data/engine error. Status worker gagal tetap tersedia melalui polling, tidak menjadi tabel kosong seolah sukses.

Retain satu hasil custom terakhir dan job aktif di memori; job lama 404 dengan pesan meminta run ulang. Cache hanya skenario default pada `build/results/default.json`, ditulis atomik setelah semua 35 run berhasil. Kunci cache mencakup full request efektif, hash dataset, engine/version, revision model dan SHA-256 kelas aplikasi agar perubahan implementasi tidak memakai data lama. Cache rusak/stale tidak digunakan: jalankan ulang dan jelaskan loading. Jangan menyediakan JSON hasil buatan tangan. Bila default tersedia dari run nyata sebelumnya, Slide 5 langsung menampilkannya lengkap dengan timestamp dan label cache; pada pertama kali tanpa cache tampilkan loading hingga run nyata selesai. Tombol Run selalu menjalankan eksperimen baru, tidak diam-diam membaca cache.

Static handler hanya melayani resource web yang terdaftar, bukan seluruh working directory. Sediakan route PDF sumber yang di-whitelist untuk tautan sitasi. Body request maksimal 64 KiB. Semua error dipresentasikan sebagai teks, bukan HTML dari backend. Tidak diperlukan autentikasi untuk server loopback presentasi ini.

### 8. Bangun lima slide dan mesin visualisasi live
Frontend baru: `src/main/resources/web/index.html`, `styles.css`, `js/app.js`, `js/api.js`, `js/scenario-form.js`, `js/algorithms/{rng,decoder,csa,phs}.js`, `js/visualizer.js`, `js/evaluation.js`. Vanilla ES modules dan CSS/SVG native. Reuse satu komponen form/state untuk Slide 4/5; tidak membuat dua aturan validasi berbeda. Sumber data/engine sesuai langkah 1–7.

**Slide 1:** judul, Kelompok 5, mata kuliah, dan tepat lima anggota: 5027241002 Balqis Sani Sabillah; 5027241018 Zaenal Mustofa; 5027241039 Rayka Dharma Pranandita; 5027241083 Mutiara Diva Jaladitha; 5027241101 Binar Najmuddin Mahya.

**Slide 2:** task→VM heterogen, ruang kombinatorial, metaheuristik exploration/exploitation, fitness, manfaat serta tidak adanya jaminan optimum. Pakai diagram task/host/VM yang dapat dipahami tanpa membaca kode.

**Slide 3:** tab CSA/PHS dalam bagian yang sama, konsep, alur, parameter, objective, sitasi halaman PDF dan panel “Paper vs adaptasi”. CSA membahas biner/Pareto/energi asli versus integer dan rumus pelengkapan. PHS menunjukkan dua HM, satu ritme improvisation per iterasi, crossover berbeda, HEFT seed; bukan HMCR/PAR generik. Bedakan dataset GoCJ independen dari workflow DAG paper. Klaim peningkatan paper tidak menjadi hasil proyek.

**Slide 4:** tab mode `Step-by-step (JavaScript)` dan `Run CloudSim (Backend)`, tab algoritma CSA/PHS, form skenario (file dataset dan subset N, DC, host/DC, VM/DC, distribusi tiga tipe), runs/seed dan advanced algorithm settings. Demo memakai default 8 task pertama file terpilih, maksimum 30, population 6/selected 3/generations 10 atau HM 4/iterations 10/improvisations 3. Ini subset terpisah yang jelas berlabel, tidak mengubah N workload backend. Form edit menghentikan playback dan meminta Reset untuk membuat state baru; tidak mencampurkan state dari konfigurasi lama.

Mesin JS mengimplementasikan operator/decoder/objective/RNG yang sama sebagai generator/state machine: satu Next = satu fase/operator bermakna, bukan satu gambar preset. Kontrol Next, Play/Pause, Reset, speed 0.5×/1×/2×, seed dan parameter. Pertahankan state selama pindah tab; pause saat slide tidak terlihat. Snapshot untuk UI hanya state saat ini dan riwayat convergence, bukan seluruh populasi semua iterasi.
- CSA: matriks antibody→task→VM, parent terpilih, clone rank/jumlah, mutation before/after, F/T/E, survivor, archive Pareto dan best-so-far.
- PHS: dua HM berdampingan, parent/crossover, ritme aktif, operator resource dan schedule, probe fitness, acceptance/rejection, inventaris vs VM aktif dan faktor kapasitas.
- Timeline hasil decoder diberi label **ilustrasi JS, bukan hasil CloudSim**. Backend mode menampilkan timeline/pemetaan run pertama dari respons, sembilan metrik dan provenance; tidak menyulap demo menjadi angka evaluasi.

**Slide 5:** form skenario bersama, tombol Run semua tujuh algoritma, indikator completedRuns/totalRuns, tabel tujuh baris × sembilan metrik dengan unit, arah lebih baik dan mean ± SD. Header/kolom algorithm sticky dan scroll horizontal bila perlu. Tampilkan hasil default saat pertama dibuka sesuai perilaku cache; perubahan input menandai hasil lama “konfigurasi berbeda—belum dijalankan”, tidak mengubah label provenance hasil lama. Saat gagal tetap boleh melihat hasil lama dengan label jelas, error dan tombol Run ulang; tidak menggantinya dengan nol. Tidak perlu grafik duplikat tabel; convergence/timeline digunakan untuk ide berbeda.

Navigasi lima bagian melalui tombol, indikator 1/5, ArrowLeft/Right dan Home/End (jangan menangkap keyboard saat fokus input), hash `#slide-1`…`#slide-5`. Layout desktop presentasi 16:9 tetapi panel boleh scroll vertikal, responsive hingga 768 px tanpa teks terpotong. Warna konsisten untuk tipe VM, legend/pola teks untuk aksesibilitas; fokus keyboard terlihat, reduced-motion mematikan transisi dekoratif. Display hanya 50 allocation per halaman dan timeline 100 task per viewport; workload tetap seluruh N. Semua angka simulasi bersumber respons API, tidak hard-code hasil evaluasi.

Langkah 1–2 menjadi prerequisite; baseline langkah 3 menyediakan referensi CSA dan seed helper PHS. CSA dan PHS dapat dikerjakan independen setelah kontrak decoder/RNG stabil. API dan shell slide dapat dikerjakan paralel setelah model respons terkunci; integrasi visual algoritma menunggu operator Java yang terverifikasi.

## Critical files & anchors
1. `task.md` §3–6: daftar slide, anggota, input panel, baseline, sembilan metrik dan dataset; baca ulang sebelum implementasi.
2. `Clonal Selection Algorithm (CSA).pdf`, PDF hlm. 3–5/cetak 224–226: model multiobjektif, encoding, affinity, Pareto dan keterbatasan detail; jangan mengklaim rumus adaptasi sebagai kutipan.
3. `Polyrhythmic Harmony Search.pdf`, PDF hlm. 3–6: dua HM, Gambar 2–6, operator, TC/MRC dan parameter eksperimen.
4. `gocj_dataset/GoCJ_Dataset_1000.csv`, awal dan seluruh berkas: input default aktual, arrival bukan nol semua.
5. `gocj_dataset/GoCJ_Dataset_5000.csv:4986`: SLA hasil koreksi yang disebut task.md; file catatan koreksi sendiri tidak tersedia.

## Verification
Semua perintah berikut dijalankan setelah implementasi dari root proyek. Prasyarat JDK 25, internet pada build pertama untuk Gradle/dependency, browser Chromium. Tidak ada env var wajib. Saat perencanaan hanya audit CSV dan pembacaan sumber yang sudah dilakukan; aplikasi belum dibuat/dijalankan dan tidak ada klaim hasil CloudSim.

### A. Kontrak fisik dan metrik, bukan sekadar compile
Buat test JUnit perilaku `SimulationSemanticsTest`, `AlgorithmInvariantTest`, `ApiValidationTest` dalam `src/test/java/id/ac/soka/scheduling/`; `gradlew.bat test` harus lulus. Fixture sintetis hanya test, tidak untuk tabel presentasi:
- Satu VM 1 PE 1000 MIPS; task (1000 MI,a=1), (2000 MI,a=1), (1000 MI,a=5), FCFS. Output CloudSim relatif epoch: start [1,2,5], finish [2,4,6], makespan 6 s, mean waiting 1/3 s, execution 4/3 s, turnaround 5/3 s, throughput 0.5 task/s, utilization 66.6667%, DI 0, cost 0.04 G$. Toleransi waktu 0.01 s untuk event precision; jangan mengubah ekspektasi agar menutupi kesalahan arrival/queue.
- VM 2 PE 1000 MIPS dan dua task 1000 MI tiba t=1: keduanya mulai t=1 selesai t=2; bukan selesai t=1.5. Task masa depan tetap diproses walau sistem sempat idle.
- Fixture beda priority dan arrival membuktikan task belum datang tidak menghalangi ready task. Prediksi decoder vs CloudSim start/finish cocok dalam toleransi pada seluruh algoritma dan PHS faktor 0.5.
- VM dinonaktifkan PHS tidak menerima task tetapi tetap ada dalam inventaris dan penyebut utilization; faktor 0.5 menggandakan waktu CPU untuk task identik. DC/host/VM aktual sesuai request, tanpa fallback placement tersembunyi.
- N=1 dan satu VM: mutation/swap/deactivate tidak infinite loop; task tepat sekali, tetap selesai. PHS crossover mempertahankan permutation, update hanya memory ritme aktif; CSA archive bebas dominasi dan elite tidak memburuk pada scalar F.
- MinMin/MaxMin jalur besar vs referensi kecil menghasilkan pilihan identik pada fixture dengan tie, heterogeneous VM dan arrival gaps. Gunakan fixture yang membedakan FCFS, RR, SJF.
- Aggregator fixture run [1,3] → mean 2, sample SD sqrt(2); runs=1 SD 0. Tolak SLA=4, taskCount melebihi file, distribusi tidak cocok, path traversal dan placement tidak muat.

### B. Smoke aplikasi dan HTTP nyata
1. `gradlew.bat run`; buka `http://localhost:8080` dan pastikan slide berasal server Java. Jalankan dari terminal PowerShell lain:
```powershell
$body = @{ dataset='GoCJ_Dataset_1000.csv'; algorithms=@('CSA','PHS','FCFS','RR','SJF','MinMin','MaxMin'); taskCount=8; datacenters=2; hostsPerDatacenter=5; vmsPerDatacenter=5; vmDistribution=@{small=2;medium=2;large=1}; runs=2; seed=42 } | ConvertTo-Json -Depth 8
$j = Invoke-RestMethod http://localhost:8080/api/simulate -Method Post -ContentType 'application/json' -Body $body
do { Start-Sleep -Seconds 1; $s = Invoke-RestMethod "http://localhost:8080/api/simulations/$($j.jobId)" } while ($s.status -eq 'RUNNING')
$s.status
$s.result.results | Select-Object algorithm,metrics
```
Ekspektasi SUCCEEDED, tujuh algoritma × dua run nyata, sembilan metrik finite, delapan allocation per representativeRun, task IDs 0..7, start>=arrival, seluruh VM sesuai inventaris 2 DC ×5 VM. Repeat request seed sama menghasilkan assignment dan metrik simulasi sama (kecuali schedulingTime/timestamp).
2. Request distribusi 2/2/2 dengan vmsPerDatacenter=5 → HTTP 400 beserta field error; submit job kedua saat worker hidup →409; file palsu tidak terbaca. Verifikasi process timeout memakai test dengan deadline service yang dipendekkan menjadi 1 ms melalui constructor test, bukan parameter publik; child benar-benar berhenti dan job berikutnya dapat berjalan.
3. Jalankan default 1000 task, lima run, seluruh tujuh algoritma sampai selesai; amati progress 35/35 dan provenance/cache. Refresh Slide 5 → hasil nyata yang sama dengan label cache, bukan hitung ulang otomatis. Ubah subset, jalankan, dan pastikan dataset/hash/request hasil cocok.
4. Jalankan masing-masing file 5000 dan 10000 dengan seluruh algoritma, runs=1, parameter optimasi default hingga selesai dalam timeout 900 s. Jika lewat batas, profil dan optimalkan evaluator/baseline tanpa menurunkan N, budget, atau mengubah operator diam-diam. Bila mesin benar-benar tidak mampu, laporkan waktu/konfigurasi dan timeout sebagai keterbatasan yang terukur; default dan kemampuan input 10000 tetap harus berfungsi, tidak boleh menandai seluruh deliverable selesai hanya dari fixture kecil.

### C. Bukti browser dan kesetaraan live
- Verifikasi visual pada 1366×768 serta lebar 768: kelima bagian, semua anggota, keyboard navigation, input fokus, tabel scroll, loading/error dan sumber PDF dapat dibuka. Ambil screenshot slide 4 dan 5 dari aplikasi nyata.
- CSA subset 8/seed42: Next menyorot selection→clone→mutation→survivor, Play/Pause berhenti, Reset mengembalikan state deterministik. PHS tampilkan dua HM, pergantian ritme, subset aktif dan kapasitas; perubahan factor terlihat pada hasil decoder.
- Bandingkan output JS dan Java untuk input kecil dan seed sama melalui skrip smoke sekali pakai: initial population/memory, keputusan operator, assignment final dan fitness; schedulingTime tidak dibandingkan. Gunakan nilai RNG pertama sebagai diagnosis bila hasil divergen. Jangan menyimpan test yang sekadar memeriksa source text.
- Dari Slide 4 ubah jumlah DC/host/VM/distribusi valid dan Run CloudSim; cek topology hasil aktual berubah. Dari Slide 5 jalankan semua algoritma dengan konfigurasi tersebut; tabel baru memiliki request yang sama. Invalid sum diblokir frontend, request bypass frontend tetap ditolak backend.
- Mode JS tetap berjalan bila API simulasi gagal setelah data subset sudah dimuat; backend mode menampilkan error, tidak menggantinya dengan hasil JS. Mengganti parameter saat hasil lama masih terlihat memberi label stale yang benar.

## Assumptions & contingencies
- Pengguna memilih **akademik visual** dan **inventaris tetap, pemakaian PHS adaptif**. Bahasa Indonesia; materi ilmiah tetap menyertakan istilah Inggris saat diperlukan.
- Arrival dianggap detik dan SLA hanya kelas metadata; task.md tidak menyediakan konversi/deadline. Daya host, tarif CPU, budget demo dan batas form adalah parameter eksperimen yang diumumkan, bukan fakta dari GoCJ atau paper.
- `DATA_CORRECTIONS.md` tetap hilang: lanjut memakai CSV yang telah lolos audit, tampilkan catatan provenance bahwa file catatan tidak tersedia. Jika file itu tersedia saat eksekusi, baca sebelum parser final; jika aturan bertentangan dengan CSV hentikan penggunaan dataset terkait dengan pesan spesifik, jangan memperbaiki data diam-diam.
- Koneksi dependency JitPack gagal: jangan ganti engine. Gunakan source upstream tag 7.0.1 commit `9a414ff15df0caa2978efb5bcd6e6180fa58bb66` sebagai subproject Gradle vendored, hanya source modul cloudsim beserta lisensi, dan dependensi/version dari POM upstream yang telah dibaca. Tidak memerlukan Maven sistem. Bila distribusi Gradle/dependency sama sekali tidak dapat diakses, laporkan prerequisite jaringan/artifact yang hilang; tidak membuat simulator palsu.
- Rumus PDF yang tidak terbaca tidak menjadi blocker karena seluruh rumus operasional di atas dilabeli adaptasi; jangan menyatakan reproduksi persis. Apabila renderer tersedia saat implementasi, pastikan kutipan asli benar sebelum menambah rumus paper ke slide; rumus adaptasi dan kontrak eksperimen tidak diubah tanpa alasan correctness.
