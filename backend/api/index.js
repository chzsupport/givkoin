const app = require('../src/app');
const connectDB = require('../src/config/database');

let dbConnectPromise;

module.exports = async (req, res) => {
  try {
    if (!dbConnectPromise) {
      dbConnectPromise = connectDB();
    }
    await dbConnectPromise;
    return app(req, res);
  } catch (error) {
    console.error('Vercel bootstrap failed:', error);
    return res.status(500).json({ message: 'Server initialization failed' });
  }
};
