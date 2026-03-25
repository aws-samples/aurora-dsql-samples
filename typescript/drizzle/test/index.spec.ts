import { runExamples } from "../src/index";

const SECONDS = 1000;

describe("Drizzle DSQL example", () => {
    test(
        "Runs all the example code",
        async () => {
            await runExamples();
        },
        60 * SECONDS,
    );
});
