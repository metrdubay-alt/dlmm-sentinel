import { expect, it } from "vitest";
import packageJson from "../../../package.json";
import { APP_VERSION } from "../../renderer/app-version";

it("uses the packaged app version in the interface", () => {
  expect(APP_VERSION).toBe(packageJson.version);
});
