# Eigene Company-App ergänzen

Company-Apps sind React-Module, die direkt in Connect laufen. Sie werden in der
Unternehmen-Ansicht angezeigt und brauchen keinen eigenen `localhost`-Server.

## Ein neues Modul

Lege einen Ordner unter `apps/app/src/company-apps/modules/<modul-id>/` an:

```text
modules/
└── flux/
    ├── manifest.ts
    └── app.tsx
```

`manifest.ts` ordnet das Modul anhand der Company-ID oder des Handles zu:

```ts
import type { CompanyAppManifest } from "../../types";

export const manifest: CompanyAppManifest = {
  id: "flux",
  companyHandles: ["flux"],
};
```

`app.tsx` ist der Einstiegspunkt. Der Vite-Registry-Loader findet ihn
automatisch; an einer zentralen Liste muss nichts geändert werden:

```tsx
import type { CompanyAppProps } from "../../types";

export default function FluxApp({ company, storage }: CompanyAppProps) {
  const count = storage.read("counter", 0);
  return (
    <main className="min-h-0 flex-1 overflow-auto p-6">
      <h1 className="text-2xl font-semibold">{company.name}</h1>
      <button onClick={() => storage.write("counter", count + 1)}>
        Lokal gespeicherte Aktion: {count}
      </button>
    </main>
  );
}
```

Die Company-App erhält `company` und einen isolierten `storage`-Adapter.
Speichere eigene Daten über `storage.read/write/remove/subscribe`; der Schlüssel
ist automatisch auf Modul und Company begrenzt. Der Code wird zusammen mit
Connect gebaut und unter der bestehenden Connect-Adresse ausgeliefert.

## Eine bestehende App übernehmen

Der Code der App muss in ein React-Modul überführt werden, das von Connects
`app.tsx` aus importiert wird. Wiederverwendbare React-Komponenten und
Produktlogik können übernommen werden; eine eigenständige App-Shell, Router,
Auth-Provider und globale CSS-Regeln müssen an Connects Host angepasst werden.
Lege Geheimnisse oder private Zugangsdaten nie in ein Frontend-Modul.

## Flux-Modul

`modules/flux` ist die erste echte Integration: Es ordnet sich dem Company-Handle
`flux` zu und bringt Flux-Übersicht, Bestandssuche, Statuspflege, Produktanlage
und CSV-Import direkt in Connect. Der Katalog wird je Company lokal in Connect
gespeichert. Einen bestehenden Flux-Bestand kannst du als CSV importieren.
