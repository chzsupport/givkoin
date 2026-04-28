import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/point', (req, res) => {
  const { x, y, z } = req.body || {};
  const nx = Number(x);
  const ny = Number(y);
  const nz = Number(z);

  if (![nx, ny, nz].every(Number.isFinite)) {
    console.log('[leaf-point] invalid:', req.body);
    return res.status(400).json({ ok: false });
  }

  console.log(`[leaf-point] ${nx} ${ny} ${nz}`);
  return res.json({ ok: true });
});

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`[leaf-point-server] listening on http://localhost:${PORT}`);
});
