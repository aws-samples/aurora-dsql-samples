/** @type {import('jest').Config} */
module.exports = {
  testMatch: ["**/test/**/*.test.js"],
  testTimeout: 60000,
  moduleNameMapper: {
    "^@generated/(.*)$": "<rootDir>/generated/$1",
  },
};
