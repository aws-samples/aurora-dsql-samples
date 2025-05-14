import { runExamples } from "../src/index.js"

const SECONDS = 1000;

describe("Index module", () => {
    test("Runs all the example code", async () => {
        await runExamples();
    }, 60 * SECONDS)
})
