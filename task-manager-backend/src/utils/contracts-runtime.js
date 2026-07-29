const path = require('node:path');

const runtimePath = path.resolve(__dirname, '../../../packages/contracts/dist/cjs/runtime.js');

let cachedRuntime;
let warnedMissingRuntime = false;
let warnedInvalidRuntime = false;

const loadContractsRuntime = () => {
    if (cachedRuntime !== undefined) {
        return cachedRuntime;
    }

    try {
        cachedRuntime = require(runtimePath);
        return cachedRuntime;
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes(runtimePath)) {
            if (!warnedMissingRuntime) {
                console.warn(
                    'Shared contracts runtime build not found. Run "npm run build:contracts" from the repo root to enable shared runtime request validation.'
                );
                warnedMissingRuntime = true;
            }

            cachedRuntime = null;
            return cachedRuntime;
        }

        if (
            error.code === 'ERR_REQUIRE_ESM' ||
            String(error.message || '').includes('exports is not defined in ES module scope')
        ) {
            if (!warnedInvalidRuntime) {
                console.warn(
                    'Shared contracts runtime build is not loadable as CommonJS. Run "npm run build:contracts" from the repo root; backend will continue without shared runtime request validation.'
                );
                warnedInvalidRuntime = true;
            }

            cachedRuntime = null;
            return cachedRuntime;
        }

        throw error;
    }
};

module.exports = {
    loadContractsRuntime
};
