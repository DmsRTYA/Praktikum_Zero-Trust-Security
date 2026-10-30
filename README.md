# Sistem Nilai Zero Trust

Dibuat Oleh 
Dhimas Raditya
247006111119 (Kelas D)

Tugas Praktikum Individu **Zero Trust Security**, Keamanan Informasi, Informatika Universitas Siliwangi.

API Gateway berperan sebagai **Policy Enforcement Point (PEP)** yang terpisah dari service (NIST SP 800-207). Semua akses, termasuk panggilan antar-service, diperiksa gateway dan dicatat di audit log.

```
Browser / Postman ──► GATEWAY :3000 (PEP + Policy Engine + Policy Administrator) ──► Service Nilai     :3001
                              │  token RS256, device, kebijakan, audit               └─► Service Transkrip :3002
                              └──────────── database SQLite bersama ─────────────────────┘
```

## Cara Menjalankan

Prasyarat: **Node.js 22.13 atau lebih baru** (memakai SQLite bawaan, tanpa `npm install`).
Pada Node yang lebih lama (18/20), jalankan `npm install` sekali (memasang `better-sqlite3`).

```bash
npm run setup     # membuat key pair RS256 (keys/) dan .env berisi secret acak
npm run seed      # membuat database + data awal (aman diulang untuk mengatur ulang demo)
npm run dev       # menjalankan gateway + 2 service dalam satu terminal
```

Buka **http://localhost:3000**. Tanpa dependensi npm apa pun: HTTP, JWT RS256, hash password, dan router memakai modul bawaan Node.js.

> Jam akses default **07:00 sampai 21:00 WIB**. Di luar jam itu, mengubah nilai dan finalisasi **memang ditolak**. Untuk mencoba di luar jam, ubah `JAM_AKSES_MULAI` dan `JAM_AKSES_SELESAI` di `.env` lalu jalankan ulang (mis. `00:00` dan `24:00`).

## Akun Data Awal

Password semua akun diambil dari `SEED_DEFAULT_PASSWORD` di `.env` (default hasil `npm run setup`: `password123`, **khusus demo**).

| Username | Role | NIM | Device ID |
|---|---|---|---|
| `admin01` | admin | - | `DEV-ADM-001` |
| `dosen01` | dosen (kelas KP70065004 Keamanan Informasi) | - | `DEV-DSN-001` |
| `dosen02` | dosen (kelas IF70011003 Pemrograman Web) | - | `DEV-DSN-002` |
| `mhs01` | mahasiswa | 237006001 | `DEV-MHS-001` |
| `mhs02` | mahasiswa | 237006002 | `DEV-MHS-002` |
| `mhs03` | mahasiswa | 237006003 | `DEV-MHS-003` |

Setiap user punya tepat 1 device terdaftar. Nilai awal berstatus draft untuk dua kelas.

## Endpoint (Semua Lewat Gateway :3000)

| Endpoint | Diizinkan | Kondisi |
|---|---|---|
| `POST /auth/login` | semua | Kredensial valid dan header `X-Device-ID` terdaftar untuk user itu |
| `POST /auth/refresh`, `/auth/logout` | semua | Refresh token valid dan belum dicabut |
| `POST /auth/service` | Service Nilai | `client_id` + `client_secret` valid, token 5 menit, `role: service` |
| `GET /nilai` | mahasiswa, dosen | Mahasiswa: nilai miliknya pada kelas final. Dosen: kelas yang diampu |
| `PUT /nilai/:id` | dosen | Kelas diampu, belum final, dalam jam akses |
| `POST /kelas/:id/finalisasi` | dosen | Kelas diampu, dalam jam akses, lalu sinkron ke transkrip |
| `GET /transkrip/:nim` | mahasiswa, admin | Mahasiswa: NIM sendiri. Admin: semua |
| `POST /transkrip/sinkron` | hanya token service | Token user mana pun ditolak |
| `GET /audit` | semua user | Tambahan untuk panel log di UI: admin melihat semua, lainnya hanya jejak miliknya |

Setiap request user wajib membawa `Authorization: Bearer <access token>` dan `X-Device-ID`.

## Keterbatasan yang diketahui

- **Access token tetap berlaku sampai habis (maks. 10 menit) setelah logout.** Logout hanya mencabut refresh token. Ini sifat JWT stateless; mitigasinya masa berlaku pendek dan token terikat device.
- Jika Service Nilai berhenti tepat di antara "set final" dan "sinkron", kelas tertinggal final tanpa data di transkrip. Update kompensasi hanya berjalan selama proses hidup.
- Token dan device ID tersimpan di `sessionStorage` browser, sehingga bergantung pada perlindungan XSS (semua keluaran memakai `textContent` dan CSP `script-src 'self'`).
- Font Inter dan JetBrains Mono dimuat dari Google Fonts. Tanpa internet, tampilan memakai font sistem.

## Struktur

```
gateway/            PEP :3000  (server.js, auth.js, audit.js, proxy.js, policy/, public/ = antarmuka)
service-nilai/      :3001      (server.js, guard.js, transkripClient.js)
service-transkrip/  :3002      (server.js, guard.js)
shared/             env, db (adapter SQLite), jwt, password, http, safeEqual
db/                 schema.sql, seed.js
scripts/            setup.js, dev.js
tests/              integration.test.js
```
