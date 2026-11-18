import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSpokenLanguages,
  higherLevel,
  LANGUAGE_OPTIONS,
  languageName,
  levelsFrom,
  normalizeLanguageCodes,
  normalizeSpokenLanguages,
} from "@/lib/languages";

test("languages are named in English, unknown codes as they are", () => {
  assert.equal(languageName("ar"), "Arabic");
  assert.equal(languageName("ti"), "Tigrinya");
  assert.equal(languageName("xx-nonsense"), "xx-nonsense");
  assert.ok(LANGUAGE_OPTIONS.some((option) => option.label === "Persian"));
});

test("spoken languages: known codes, once each, the higher level kept", () => {
  assert.deepEqual(
    normalizeSpokenLanguages([
      { language: " AR ", level: "BASIC" },
      { language: "klingon", level: "NATIVE" },
      { language: "ar", level: "FLUENT" },
      { language: "en" },
      { language: "ar", level: null },
    ]),
    [
      { language: "ar", level: "FLUENT" },
      { language: "en", level: null },
    ],
  );
  assert.deepEqual(normalizeLanguageCodes(["IT", "it", "zz", "de"]), [
    "it",
    "de",
  ]);
});

test("levels compare from basic to native", () => {
  assert.equal(higherLevel("NATIVE", "BASIC"), "NATIVE");
  assert.equal(higherLevel(null, "BASIC"), "BASIC");
  assert.equal(higherLevel(undefined, undefined), null);
  assert.deepEqual(levelsFrom("FLUENT"), ["FLUENT", "NATIVE"]);
  assert.equal(
    formatSpokenLanguages([
      { language: "ar", level: "NATIVE" },
      { language: "en" },
    ]),
    "Arabic (Native), English",
  );
});
