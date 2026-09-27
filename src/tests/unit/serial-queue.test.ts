import { expect, it } from "vitest";
import { SerialQueue } from "../../main/services/serial-queue";
it("serializes capture, mode change and deletion, and recovers after a rejected operation", async () => {
  const queue = new SerialQueue();
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const capture = queue.run(async () => {
    events.push("capture");
    await gate;
    events.push("saved");
  });
  const change = queue.run(async () => {
    events.push("demo");
    throw new Error("test");
  });
  const deletion = queue.run(async () => {
    events.push("delete");
  });
  const rejected = expect(change).rejects.toThrow("test");
  await Promise.resolve();
  expect(events).toEqual(["capture"]);
  release();
  await capture;
  await rejected;
  await deletion;
  expect(events).toEqual(["capture", "saved", "demo", "delete"]);
});
