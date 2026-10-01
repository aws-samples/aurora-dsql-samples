/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  testTimeout: 60000,
  transform: {
    "^.+\\.tsx?$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
  moduleNameMapper: {
    "^@generated/(.*)$": "<rootDir>/generated/$1",
  },
};
