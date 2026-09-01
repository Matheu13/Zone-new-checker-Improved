import assert from "node:assert/strict";
import test from "node:test";
import { classifyAdultContent, isAdultContentName } from "../lib/contentClassification";

test("detects common adult category labels", () => {
  for (const name of ["XXX", "Adults Only", "18+", "Erotica", "NSFW VOD", "Red Light"]) {
    assert.equal(isAdultContentName(name), true, name);
  }
});

test("does not flag ordinary category names", () => {
  for (const name of ["Sports", "Kids", "Entertainment", "Hot Bird News", "Mature Living Room"]) {
    assert.equal(isAdultContentName(name), name === "Mature Living Room", name);
  }
});

test("classifies lists and preserves unknown when no names are available", () => {
  assert.equal(classifyAdultContent(["News", "Movies"]), "No");
  assert.equal(classifyAdultContent(["Movies", "Adult VOD"]), "Yes");
  assert.equal(classifyAdultContent([]), "Unknown");
  assert.equal(classifyAdultContent([null, 42, ""]), "Unknown");
});
