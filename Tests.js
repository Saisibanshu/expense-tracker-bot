/**************************************************************
 * Tests.gs
 * ------------------------------------------------------------
 * This file contains unit tests for the utility functions.
 **************************************************************/

/**
 * @description Runs all the unit tests and logs the results.
 * This function can be run from the Apps Script editor to
 * verify that the utility functions are working correctly.
 */
function runTests() {
  Logger.log("Running tests...");
  testParseItems();
  testDescribeDiff();
  testFmt();
  testMergeDescriptions();
  Logger.log("Tests finished.");
}

/**
 * @description Tests the parseItems function.
 */
function testParseItems() {
  Logger.log("Testing parseItems...");

  // Test case 1: A description with multiple items
  const desc1 = "coffee 50, sandwich 120";
  const items1 = parseItems(desc1);
  console.assert(items1.length === 2, "testParseItems 1 failed");
  console.assert(items1[0].item === "coffee", "testParseItems 2 failed");
  console.assert(items1[0].amount === 50, "testParseItems 3 failed");
  console.assert(items1[1].item === "sandwich", "testParseItems 4 failed");
  console.assert(items1[1].amount === 120, "testParseItems 5 failed");

  // Test case 2: A description with a single item
  const desc2 = "pizza 250";
  const items2 = parseItems(desc2);
  console.assert(items2.length === 1, "testParseItems 6 failed");
  console.assert(items2[0].item === "pizza", "testParseItems 7 failed");
  console.assert(items2[0].amount === 250, "testParseItems 8 failed");

  // Test case 3: An empty description
  const desc3 = "";
  const items3 = parseItems(desc3);
  console.assert(items3.length === 0, "testParseItems 9 failed");
}

/**
 * @description Tests the describeDiff function.
 */
function testDescribeDiff() {
  Logger.log("Testing describeDiff...");

  // Test case 1: An item is updated
  const before1 = [{ item: "coffee", amount: 50 }, { item: "sandwich", amount: 120 }];
  const after1 = [{ item: "coffee", amount: 60 }, { item: "sandwich", amount: 120 }];
  const diff1 = describeDiff(before1, after1);
  console.assert(diff1 === "Updated coffee: 50 → 60", "testDescribeDiff 1 failed");

  // Test case 2: An item is removed
  const before2 = [{ item: "coffee", amount: 50 }];
  const after2 = [];
  const diff2 = describeDiff(before2, after2);
  console.assert(diff2 === "Removed coffee ₹50", "testDescribeDiff 2 failed");

  // Test case 3: An item is added
  const before3 = [];
  const after3 = [{ item: "coffee", amount: 50 }];
  const diff3 = describeDiff(before3, after3);
  console.assert(diff3 === "Added coffee ₹50", "testDescribeDiff 3 failed");
}

/**
 * @description Tests the fmt function.
 */
function testFmt() {
  Logger.log("Testing fmt...");

  // Test case 1: An integer
  console.assert(fmt(50) === "50", "testFmt 1 failed");

  // Test case 2: A float
  console.assert(fmt(50.5) === "50.50", "testFmt 2 failed");

  // Test case 3: null
  console.assert(fmt(null) === "0", "testFmt 3 failed");

  // Test case 4: undefined
  console.assert(fmt(undefined) === "0", "testFmt 4 failed");
}

/**
 * @description Tests the mergeDescriptions function.
 */
function testMergeDescriptions() {
  Logger.log("Testing mergeDescriptions...");

  // Test case 1: Merging two descriptions
  const desc1 = "coffee 50";
  const add1 = "sandwich 120";
  const merged1 = mergeDescriptions(desc1, add1);
  console.assert(merged1 === "coffee 50, sandwich 120", "testMergeDescriptions 1 failed");

  // Test case 2: Merging with an empty description
  const desc2 = "";
  const add2 = "sandwich 120";
  const merged2 = mergeDescriptions(desc2, add2);
  console.assert(merged2 === "sandwich 120", "testMergeDescriptions 2 failed");
}
