/**************************************************************
 * Tests.gs
 * ------------------------------------------------------------
 * This file contains a lightweight testing framework and unit
 * tests for the utility functions.
 **************************************************************/

/**
 * @description A simple testing framework for Google Apps Script.
 */
const TestRunner = {
  stats: {
    total: 0,
    passed: 0,
    failed: 0,
  },

  /**
   * @description Runs a block of tests.
   * @param {string} suiteName - The name of the test suite.
   * @param {function} tests - A function containing the tests.
   */
  run: function(suiteName, tests) {
    Logger.log(`\n--- Running test suite: ${suiteName} ---`);
    tests(this);
  },

  /**
   * @description A generic assertion function.
   * @param {string} description - A description of the test case.
   * @param {function} testCase - A function that returns true for pass, false for fail.
   */
  test: function(description, testCase) {
    this.stats.total++;
    try {
      if (testCase()) {
        this.stats.passed++;
        Logger.log(`  [PASSED] ${description}`);
      } else {
        this.stats.failed++;
        Logger.log(`  [FAILED] ${description}`);
      }
    } catch (e) {
      this.stats.failed++;
      Logger.log(`  [ERROR] ${description}: ${e.message}`);
    }
  },

  /**
   * @description Asserts that two values are equal.
   * @param {*} expected - The expected value.
   * @param {*} actual - The actual value.
   * @param {string} message - A message for the test case.
   */
  assertEquals: function(expected, actual, message) {
    this.stats.total++;
    // Basic deep comparison for arrays of objects
    if (JSON.stringify(expected) === JSON.stringify(actual)) {
      this.stats.passed++;
      Logger.log(`  [PASSED] ${message}`);
    } else {
      this.stats.failed++;
      Logger.log(`  [FAILED] ${message}`);
      Logger.log(`    Expected: ${JSON.stringify(expected)}`);
      Logger.log(`    Actual:   ${JSON.stringify(actual)}`);
    }
  },

  /**
   * @description Logs the final test results.
   */
  logResults: function() {
    Logger.log("\n--- Test Results ---");
    Logger.log(`Total tests: ${this.stats.total}`);
    Logger.log(`Passed: ${this.stats.passed}`);
    Logger.log(`Failed: ${this.stats.failed}`);
    Logger.log("--------------------");
  }
};

/**
 * @description Runs all the unit tests and logs the results.
 */
function runTests() {
  TestRunner.run("Utils.gs", (t) => {
    // Test suite for parseItems
    t.run("parseItems", () => {
      const desc1 = "coffee 50, sandwich 120";
      const expected1 = [{ item: "coffee", amount: 50 }, { item: "sandwich", amount: 120 }];
      t.assertEquals(expected1, parseItems(desc1), "should parse a description with multiple items");

      const desc2 = "pizza 250";
      const expected2 = [{ item: "pizza", amount: 250 }];
      t.assertEquals(expected2, parseItems(desc2), "should parse a description with a single item");

      const desc3 = "";
      const expected3 = [];
      t.assertEquals(expected3, parseItems(desc3), "should handle an empty description");
    });

    // Test suite for describeDiff
    t.run("describeDiff", () => {
        const before1 = [{ item: "coffee", amount: 50 }, { item: "sandwich", amount: 120 }];
        const after1 = [{ item: "coffee", amount: 60 }, { item: "sandwich", amount: 120 }];
        t.assertEquals("Updated coffee: 50 → 60", describeDiff(before1, after1), "should detect an updated item");

        const before2 = [{ item: "coffee", amount: 50 }];
        const after2 = [];
        t.assertEquals("Removed coffee ₹50", describeDiff(before2, after2), "should detect a removed item");

        const before3 = [];
        const after3 = [{ item: "coffee", amount: 50 }];
        t.assertEquals("Added coffee ₹50", describeDiff(before3, after3), "should detect an added item");
    });

    // Test suite for fmt
    t.run("fmt", () => {
      t.assertEquals("50", fmt(50), "should format an integer");
      t.assertEquals("50.50", fmt(50.5), "should format a float");
      t.assertEquals("0", fmt(null), "should handle null");
      t.assertEquals("0", fmt(undefined), "should handle undefined");
    });

    // Test suite for mergeDescriptions
    t.run("mergeDescriptions", () => {
      const desc1 = "coffee 50";
      const add1 = "sandwich 120";
      t.assertEquals("coffee 50, sandwich 120", mergeDescriptions(desc1, add1), "should merge two descriptions");

      const desc2 = "";
      const add2 = "sandwich 120";
      t.assertEquals("sandwich 120", mergeDescriptions(desc2, add2), "should merge with an empty description");
    });
  });

  TestRunner.logResults();
}
