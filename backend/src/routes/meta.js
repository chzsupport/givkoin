const express = require('express');

const router = express.Router();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dayKeyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

router.get('/server-day', (_req, res) => {
  const now = new Date();
  return res.json({
    serverDay: dayKeyLocal(now),
    serverNow: now.toISOString(),
  });
});

 router.get('/server-time', (_req, res) => {
   const now = new Date();
   return res.json({
     serverNow: now.getTime(),
     serverNowIso: now.toISOString(),
     serverTzOffsetMin: -now.getTimezoneOffset(),
   });
 });

module.exports = router;
