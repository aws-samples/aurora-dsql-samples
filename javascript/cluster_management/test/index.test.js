import { executeSingleRegion, executeMultiRegion } from "../src"

const timeout = 300 * 1000; 

test('Execute CRUD for single region cluster', async function() {
    await executeSingleRegion();
}, timeout);

test('Execute CRUD for multi region cluster', async function() {
    await executeMultiRegion();
}, timeout);
