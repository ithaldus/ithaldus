# IT Haldus

Organisatsiooni IT halduskeskkond.

## Funktsioonid

- **Võrgukaart** - Võrguseadmete automaatne avastamine SSH/SNMP kaudu
- **Arvutite andmebaas** - Arvutite register
- **Seadmete andmebaas** - Muude IT seadmete haldamine
- **Helpdesk** - Kasutajate pöördumiste haldamine
- **Turvasündmused** - Intsidentide registreerimine ja jälgimine
- **Mitmekeelsus** - Eesti ja inglise keel

## Eeldused

- **Docker** (üks järgmistest):
  - **Mac**: [OrbStack](https://orbstack.dev/) (soovitatav) või Docker Desktop
  - **Windows**: Docker Desktop
  - **Linux**: Docker või Podman

## Kiirstart

```bash
# 1. Kopeeri seadistusfail
cp .env.example .env

# 2. Käivita arendusserver
./dev.sh          # Linux/Mac
dev.cmd           # Windows

# 3. Käivita migratsioonid ja andmebaasi seedimine (ainult esimesel korral)
docker compose exec dev bun run db:migrate
docker compose exec dev bun run db:seed

# 4. Ava http://localhost:3000 ja logi sisse: admin / admin123
```

## Käsud

```bash
./ithaldus status          # Vaata olekut
./ithaldus --dev start     # Käivita arendusserver (OrbStack VM-iga)
./ithaldus --dev stop      # Peata arendusserver
./ithaldus --dev logs      # Vaata logisid

./ithaldus build           # Ehita tootmisversioon
./ithaldus start           # Käivita tootmisversioon
./ithaldus stop            # Peata tootmisversioon
```

## Tehnoloogiad

- **Käitusaeg**: Bun
- **Kasutajaliides**: React + Vite + TailwindCSS
- **Taustarakendus**: Hono
- **Andmebaas**: SQLite + Drizzle ORM
- **Autentimine**: Microsoft 365 OAuth

## Projekti struktuur

```
src/
├── client/              # React kasutajaliides
│   ├── components/      # UI komponendid
│   ├── routes/          # Leheküljed
│   ├── i18n/            # Tõlked (en.json, et.json)
│   └── lib/             # Abifunktsioonid
└── server/              # Hono taustarakendus
    ├── db/              # Andmebaasi skeem ja migratsioonid
    ├── routes/          # API marsruudid
    ├── services/        # Skannerid ja draiverid
    └── middleware/      # Autentimise vahevara
```

## URL parameetrid (võrgukaart)

Võrgukaardi vaade toetab URL parameetreid:

| Parameeter | Näide | Kirjeldus |
|------------|-------|-----------|
| `sidebar` | `?sidebar=0` | Peida külgriba |
| `console` | `?console=0` | Peida silumiskonsool |
| `labels` | `?labels=f,v,p` | Näita ainult valitud silte |
| `types` | `?types=router,switch` | Näita ainult valitud seadmetüüpe |
| `filter` | `?filter=192.168` | Eeltäida filter |

### Sildi valikud
Kasuta täisnimesid või lühendeid: `firmware`/`f`, `interfaces`/`i`, `vendor`/`v`, `enddevices`/`e`, `assettag`/`a`, `mac`/`m`, `ports`/`p`, `serialnumber`/`s`

### Seadmetüübid
`router`, `switch`, `access-point`, `server`, `computer`, `phone`, `desktop-phone`, `tv`, `tablet`, `printer`, `camera`, `iot`, `end-device`

## Arenduskeskkond

Arenduskeskkond käivitab Dockeris kaks protsessi:
- **Vite** (port 5173) - Kasutajaliides koos kuumlaadimisega
- **Bun API** (port 3001) - Taustarakendus

Kõik päringud lähevad läbi pordi 3000.

## Staging keskkond

Staging käitab tootmisversiooni koos VPN-ühendusega.

**Linux:**
```bash
docker compose up staging
```

**Mac (OrbStack):**
```bash
./ithaldus --dev start     # Käivita VM + VPN + konteiner
./ithaldus --dev status    # Vaata olekut
./ithaldus --dev logs      # Vaata logisid
./ithaldus --dev stop      # Peata
```

## Microsoft 365 autentimine

### 1. Registreeri rakendus Azure AD-s

1. Mine [Azure portaali](https://portal.azure.com)
2. Ava **Microsoft Entra ID** → **App registrations** → **New registration**
3. Seadista:
   - **Nimi**: `IT Haldus`
   - **Redirect URI**: `http://localhost:3000/api/auth/callback`

### 2. Loo kliendi saladus

1. Ava **Certificates & secrets** → **New client secret**
2. Kopeeri saladuse väärtus kohe

### 3. Seadista keskkonnamuutujad

```env
MICROSOFT_CLIENT_ID=sinu-rakenduse-id
MICROSOFT_CLIENT_SECRET=sinu-saladus
MICROSOFT_TENANT_ID=sinu-rentniku-id
APP_URL=http://localhost:3000
```

### Arendusrežiim

Arendamiseks ilma Azure AD-ta lisa `.env` faili:
```env
AUTH_BYPASS=true
```

## Litsents

MIT
