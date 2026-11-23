# Panduan Deploy ArduSim (Rp 0 Tanpa Kartu Kredit)

ArduSim berjalan **Rp 0** tanpa kartu kredit dengan arsitektur:
1. **Backend Compiler (`apps/compiler`):** image Docker generik (port default `8080`, mendukung `PORT` dinamis, `USER 10001`, aman di limit **512 MB RAM**). Siap deploy ke **Choreo by WSO2**, platform container Docker gratis lainnya, atau **Docker Lokal + Tailscale Funnel**.
2. **Frontend Web App + PWA (`apps/web`):** **Cloudflare Pages** (online 24 jam, HTTPS otomatis, bandwidth unlimited).

---

## 1. Deploy Backend Compiler ke Choreo by WSO2 (Direkomendasikan)

1. Push repositori ini ke GitHub (`Dockerfile` dan [`.choreo/component.yaml`](./.choreo/component.yaml) sudah tersedia, port `8080`, non-root `USER 10001`).
2. Buka [console.choreo.dev](https://console.choreo.dev) -> login dengan GitHub (tanpa kartu kredit).
3. Buat **Project** baru -> **Create Component** -> pilih **Service**.
4. Hubungkan repositori GitHub **ardusim**, lalu atur build preset ke **Dockerfile**:
   - **Dockerfile Path:** `Dockerfile`
   - **Docker Context Path:** `.`
   - Choreo otomatis membaca endpoint REST port `8080` dari [`.choreo/component.yaml`](./.choreo/component.yaml).
5. Atur **Environment Variables** / **Configs** di komponen (opsional, default aman 512 MB sudah tertanam di `Dockerfile`):
   - `CORS_ORIGIN` = `https://ardusim.pages.dev,https://*.ardusim.pages.dev,http://localhost:5173,http://127.0.0.1:5173`
   - `MAX_CONCURRENT_COMPILES` = `1`
   - `COMPILE_TIMEOUT_MS` = `60000`
6. Pada konfigurasi **Health Check / Readiness Probe**, arahkan ke `GET /api/health` pada port `8080`.
7. **Wajib — Buka Akses Publik & CORS Gateway Choreo:**
   Secara default, endpoint REST Choreo mengaktifkan **OAuth2 API Security** sehingga browser langsung mendapat `401 Unauthorized`. Setelah deploy pertama selesai:
   - Masuk ke menu **Manage** -> **Settings** / **Endpoint Security** pada komponen, ubah **API Security** menjadi **None** (nonaktifkan autentikasi gateway agar frontend PWA publik bisa memanggil `/api/compile`).
   - Masuk ke pengaturan **CORS** di **Manage**, aktifkan CORS untuk origin `https://ardusim.pages.dev` (dan preview domain jika perlu), izinkan method `GET, POST, OPTIONS` dan header `Content-Type`.
   - Klik **Deploy / Redeploy** agar perubahan security & CORS aktif.
8. Uji URL publik Choreo Anda:
   ```bash
   curl https://<url-choreo-anda>/api/health
   ```
   Pastikan mengembalikan `{"ok":true,"engine":"arduino-cli",...}`.

---

## 2. Alternatif Platform Docker Gratis Lainnya (SnapDeploy / Koyeb / VPS)

`Dockerfile` sudah menggunakan port default `8080`, menghormati environment variable `PORT` dinamis dari platform, serta membatasi memori Node (`--max-old-space-size=192`) agar aman di tier **512 MB RAM**:
1. Hubungkan repo GitHub **ardusim** ke platform Docker pilihan Anda (misalnya **SnapDeploy**, **Koyeb**, atau VPS Docker pribadi) dengan build `Dockerfile` di root repo.
2. Expose port `8080` (atau biarkan platform menyuntikkan `PORT` secara otomatis; `HEALTHCHECK` di `Dockerfile` mengikuti `${PORT:-8080}`).
3. Arahkan health check platform ke `GET /api/health`.
4. Untuk container **512 MB RAM / 0.5 vCPU**, pastikan env berikut aktif (sudah menjadi default `Dockerfile`):
   - `MAX_CONCURRENT_COMPILES=1`
   - `COMPILE_TIMEOUT_MS=60000`
   - `CORS_ORIGIN=https://ardusim.pages.dev,https://*.ardusim.pages.dev,http://localhost:5173,http://127.0.0.1:5173`

> **Catatan Cold Start:** Pada layanan gratis yang menidurkan container saat idle, frontend ArduSim (`compileWithWakeRetry`) otomatis membangunkan backend via `/api/health` dan me-retry kompilasi hingga 95 detik.

---

## 3. Sambungkan Frontend di Cloudflare Pages

1. Buka [dash.cloudflare.com](https://dash.cloudflare.com) -> **Workers & Pages** -> proyek **ardusim** -> **Settings** -> **Variables and Secrets**.
2. Atur environment variable:
   - `NODE_VERSION` = `22`
   - `VITE_COMPILER_URL` = `https://<url-backend-docker-anda>` *(tanpa trailing slash)*
3. Buka tab **Deployments** -> **Retry deployment** agar `VITE_COMPILER_URL` masuk ke bundle produksi frontend.

---

## 4. Alternatif Lokal Tanpa Cold Start: Docker Lokal + Tailscale Funnel

Cocok untuk sesi praktik kelas live agar kompilasi siswa cepat (~2 detik) dan laptop pengajar menjadi server sementara:

### Setup Awal (1x Saja)
1. Nyalakan Backend Compiler di Docker dari root proyek (`/home/jooerdan/Documents/ardusim`):
   ```bash
   sudo systemctl start docker
   docker compose up -d --build
   curl http://127.0.0.1:8080/api/health
   ```
2. Install & aktifkan Tailscale Funnel:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
   - Aktifkan **MagicDNS** dan **HTTPS Certificates** di dashboard Tailscale (`https://login.tailscale.com/admin/dns`).
   - Aktifkan Funnel ke port `8080`:
     ```bash
     sudo tailscale funnel --bg 8080
     ```
   - Uji `curl https://<nama-pc>.<tailnet>.ts.net/api/health`, lalu arahkan `VITE_COMPILER_URL` Cloudflare Pages ke URL Tailscale tersebut.

### Pemakaian Harian Saat Mengajar
- **Mulai Kelas:**
  ```bash
  sudo systemctl start docker && docker compose up -d && sudo tailscale funnel --bg 8080
  ```
- **Selesai Kelas:**
  ```bash
  docker compose stop && sudo tailscale funnel reset
  ```
*(Saat backend berhenti/tertidur, halaman web Cloudflare Pages tetap bisa dibuka siswa untuk merakit rangkaian dan menjalankan 10 proyek contoh offline.)*

---

## 5. Install sebagai Aplikasi di HP & Tablet (PWA)
- **Android (Chrome):** Buka URL Cloudflare Pages -> menu titik tiga -> **Install app / Tambahkan ke layar utama**.
- **iPhone & iPad (Safari):** Buka URL Cloudflare Pages -> tombol **Share** -> **Add to Home Screen**.
