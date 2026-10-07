const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  // The migrator suite runs live DDL, and DSQL raises OC001 in any session
  // holding an older catalog version, so a suite running DML in parallel fails.
  // CI runs the two suites in separate steps; this makes `npm test` match.
  maxWorkers: 1,
  transform: {
    ...tsJestTransformCfg,
  },
};
