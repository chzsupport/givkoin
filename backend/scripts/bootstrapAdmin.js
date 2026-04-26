const connectDB = require('../src/config/database');
const { bootstrapInitialAdmin } = require('../src/services/adminBootstrapService');

async function main() {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim();
  const seedPhrase = String(process.env.BOOTSTRAP_ADMIN_SEED_PHRASE || '').trim();

  await connectDB();
  const result = await bootstrapInitialAdmin({ email, seedPhrase });

  if (result.created) {
    console.log(`Initial admin created: ${result.email}`);
    return;
  }

  console.log(`Initial admin was not created: ${result.reason}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
