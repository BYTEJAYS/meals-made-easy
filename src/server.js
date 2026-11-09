import app from './app.js';
import { config } from './config.js';
import { closeDatabases, connectDatabases } from './db.js';

await connectDatabases();
const server = app.listen(config.port, () => console.log(`Meal kit API listening on port ${config.port}`));

async function shutdown() {
  server.close(async () => {
    await closeDatabases();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
