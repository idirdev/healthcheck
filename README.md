# healthcheck

> **[EN]** Monitor HTTP endpoint health with configurable checks and alerts.
> **[FR]** Surveiller la sante des endpoints HTTP avec des verifications et alertes configurables.

---

## Features / Fonctionnalites

**[EN]**
- Check HTTP(S) endpoint availability
- Configurable timeout and expected status codes
- Response time measurement
- Body content matching (regex or string)
- Multiple endpoints in one command
- JSON output for automation
- Exit codes for CI/CD (0 = healthy, 1 = unhealthy)

**[FR]**
- Verifier la disponibilite des endpoints HTTP(S)
- Timeout et codes de statut attendus configurables
- Mesure du temps de reponse
- Verification du contenu de la reponse (regex ou string)
- Verification de plusieurs endpoints en une commande
- Sortie JSON pour l'automatisation
- Codes de sortie CI/CD (0 = sain, 1 = defaillant)

---

## Installation

```bash
npm install -g @idirdev/healthcheck
```

---

## CLI Usage / Utilisation CLI

```bash
# Check a single endpoint
healthcheck https://api.example.com/health

# Multiple endpoints
healthcheck https://api.example.com https://web.example.com

# Custom timeout (5s)
healthcheck https://api.example.com --timeout 5000

# Expect specific status
healthcheck https://api.example.com --status 200,201

# JSON output
healthcheck https://api.example.com --json
```

### Example Output / Exemple de sortie

```
$ healthcheck https://api.example.com https://web.example.com

  Endpoint                        Status    Time     Result
  -----------------------------------------------------------
  https://api.example.com         200       45ms     HEALTHY
  https://web.example.com         200       123ms    HEALTHY

  Summary: 2/2 healthy
```

---

## API (Programmatic) / API (Programmation)

```js
const { check, checkMultiple } = require('healthcheck');

const result = await check('https://api.example.com', {
  timeout: 5000,
  expectedStatus: [200]
});
// => { url: '...', status: 200, time: 45, healthy: true }

const results = await checkMultiple([
  'https://api.example.com',
  'https://web.example.com'
]);
```

---

## License

MIT - idirdev
