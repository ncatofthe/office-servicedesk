const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendDir = path.resolve(__dirname, '..');
const envPath = path.join(backendDir, '.env');
const envTestPath = path.join(backendDir, '.env.test');

function readEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    return dotenv.parse(fs.readFileSync(filePath));
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

const envTest = readEnvFile(envTestPath);

if (!envTest) {
    fail(
        'Missing task-manager-backend/.env.test. Copy .env.test.example to .env.test, point DATABASE_URL to a dedicated test database, then re-run npm --workspace task-manager-backend run test:db.'
    );
}

const missingKeys = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !envTest[key]);

if (missingKeys.length > 0) {
    fail(`Missing required .env.test keys: ${missingKeys.join(', ')}`);
}

const env = readEnvFile(envPath);

if (env && env.DATABASE_URL && env.DATABASE_URL === envTest.DATABASE_URL) {
    fail('.env.test DATABASE_URL matches .env DATABASE_URL. Use a dedicated test database before running DB-backed tests.');
}

if (/taskmanager_dev/i.test(envTest.DATABASE_URL)) {
    fail('.env.test DATABASE_URL appears to target the dev database. Use a dedicated test database before running DB-backed tests.');
}

console.log('Backend DB-backed test environment looks ready.');
