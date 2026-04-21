/** @type {import("jest").Config} **/
module.exports = {
    testEnvironment: "node",
    testMatch: ["**/dist/test/**/*.test.js"],
    testTimeout: 60000,
    moduleNameMapper: {
        "^@generated/(.*)$": "<rootDir>/dist/generated/$1",
    },
};
