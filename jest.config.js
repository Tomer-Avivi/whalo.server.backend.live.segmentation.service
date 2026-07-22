module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests", "<rootDir>/src"],
  testMatch: ["**/tests/**/*.test.ts"],
  transform: { "^.+\\.ts$": "ts-jest" },
  collectCoverageFrom: ["src/**/*.ts", "!src/service.ts"]
};
