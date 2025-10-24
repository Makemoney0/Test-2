# Restaurant Voice Agent (Deutsch) - Fertigpaket
Dieses Paket enthält einen einsatzfähigen Voice Agent für deutsche Restaurants. Er nimmt Telefonanrufe entgegen, kann Reservierungen aufnehmen, Takeaway-Bestellungen erfassen, Öffnungszeiten nennen und einfache Fragen beantworten.

## Schnellstart (Cloud - Render / Replit)
1. Entpacke das ZIP.
2. Lade den Ordner in ein GitHub-Repository (Root: package.json + index.js).
3. Deploye als Web Service z.B. auf Render (Node runtime). Als Start Command: `npm start`. Build Command: `npm install`.
4. Setze Environment Variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, OPENAI_API_KEY, PORT, SMS_FROM, AGENT_PHONE).
5. Verbinde Twilio Telefonnummer: Webhook `https://<dein-service>/voice` (HTTP POST).

## Lokal testen (nur für Fortgeschrittene)
- Node.js installieren
- `npm install`
- `npm run migrate`
- `.env` ausfüllen
- `npm start`

## Dateien im Paket
- index.js (Server)
- package.json
- .env.example
- scripts/init_db.js
- prompts/system_prompt_de.txt
- nlu_training.csv
- Dockerfile, docker-compose.yml
- README.md

## Hinweise
- API-Keys niemals öffentlich teilen.
- Für produktiven Betrieb: SSL, Backups, Monitoring und DSGVO-Prüfung implementieren.