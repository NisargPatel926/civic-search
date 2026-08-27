import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config, providerStatus } from './config.js';
import { router as apiRouter } from './routes/brief.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.json());

app.use('/api', apiRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true, providers: providerStatus() }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Anything unmatched falls back to the single page.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something broke while building your brief.', detail: err.message });
});

app.listen(config.port, () => {
  const status = providerStatus();
  const live = Object.entries(status).filter(([, on]) => on).map(([k]) => k);
  console.log(`Civic Search running at http://localhost:${config.port}`);
  console.log(live.length ? `Live providers: ${live.join(', ')}` : 'No API keys set — serving sample data.');
});
