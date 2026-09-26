// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mountApp } from "./helpers/mount.js";

let app;
let els;

function githubResponse(body, status = 200) {
  return { status, ok: status === 200, headers: new Map(), text: async () => body };
}

function mount(fetchImpl = vi.fn()) {
  ({ app, els } = mountApp({ fetchImpl }));
  return fetchImpl;
}

function chooseFile(file) {
  Object.defineProperty(els.fileInput, "files", { value: [file], configurable: true });
  els.fileInput.dispatchEvent(new Event("change"));
}

const typedTarget = () => app.store.get().target.chars.join("");
const waitForImport = () => vi.waitFor(() => expect(app.store.get().importBusy).toBe(false));

beforeEach(() => localStorage.clear());
afterEach(() => app?.destroy());

describe("local files", () => {
  test("a local file becomes the practice source and is remembered", async () => {
    mount();
    chooseFile(new File(["# header\ndef f():\r\n    return 1\n"], "tool.py"));
    await vi.waitFor(() => expect(app.store.get().item.id).toBe("custom"));
    expect(typedTarget()).toBe("def f():\n    return 1");
    expect(els.repoName.textContent).toBe("tool.py");
    expect(els.repoIcon.textContent).toBe("PY");
    expect(els.sourceSelect.value).toBe("custom");
    const custom = els.sourceSelect.querySelector('option[value="custom"]');
    expect(custom.disabled).toBe(false);
    expect(custom.textContent).toBe("Imported · tool.py");
    expect(JSON.parse(localStorage.getItem("codetype-last-import")).version).toBe(2);
    expect(els.fileInput.value).toBe("");
  });

  test("the same file can be imported twice in a row (B12)", async () => {
    mount();
    const spy = vi.spyOn(app.actions, "importLocalFile");
    chooseFile(new File(["a = 1"], "a.py"));
    await waitForImport();
    app.actions.selectSource("python-stdlib");
    chooseFile(new File(["a = 1"], "a.py"));
    await vi.waitFor(() => expect(app.store.get().item.id).toBe("custom"));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("a binary or huge file is refused with an inline message (B13, R7)", async () => {
    mount();
    chooseFile(new File([`PNG${String.fromCharCode(0)}data`], "logo.png"));
    await vi.waitFor(() => expect(els.importError.textContent).toMatch(/binary/));
    expect(els.importError.dataset.empty).toBe("false");
    expect(app.store.get().item.id).toBe("python-stdlib");

    const huge = { name: "dump.sql", size: 10_000_000, text: async () => "" };
    await app.actions.importLocalFile(huge);
    expect(els.importError.textContent).toMatch(/dump\.sql is 10\.0 MB/);
  });

  test("storage failure still loads the file and says so (B13)", async () => {
    mount();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await app.actions.importLocalFile(new File(["x = 1"], "x.py"));
    setItem.mockRestore();
    expect(app.store.get().item.id).toBe("custom");
    expect(els.noticeText.textContent).toMatch(/too large to remember/);
    expect(els.notice.dataset.empty).toBe("false");
  });
});

describe("GitHub files", () => {
  const file = ["line 1", "line 2", "line 3", "line 4"].map((l) => `print("${l}")`).join("\n");

  test("a #L range imports exactly those lines, then closes the form (B20, U4)", async () => {
    const fetchImpl = mount(vi.fn(async () => githubResponse(file)));
    els.optionsMenu.open = true;
    els.githubButton.click();
    expect(els.githubForm.hidden).toBe(false);
    expect(els.githubButton.getAttribute("aria-expanded")).toBe("true");
    els.githubUrl.value = "https://github.com/a/b/blob/main/src/hello.py#L2-L3";
    els.githubForm.requestSubmit();
    await vi.waitFor(() => expect(app.store.get().item.id).toBe("custom"));
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://raw.githubusercontent.com/a/b/main/src/hello.py",
    );
    expect(typedTarget()).toBe('print("line 2")\nprint("line 3")');
    expect(els.repoName.textContent).toBe("a/b");
    expect(els.repoPath.textContent).toBe(" / src / hello.py · lines 2–3");
    expect(els.githubForm.hidden).toBe(true);
    expect(els.githubUrl.value).toBe("");
    expect(els.optionsMenu.open).toBe(false);
    expect(els.rangeRow.hidden).toBe(false);
    expect([els.rangeStart.value, els.rangeEnd.value, els.rangeTotal.textContent]).toEqual([
      "2",
      "3",
      "of 4",
    ]);
  });

  test("errors are shown inline and the form stays open (Q18)", async () => {
    mount(vi.fn(async () => githubResponse("", 404)));
    app.actions.toggleGithubForm();
    await app.actions.importGithub("https://github.com/a/b/blob/main/missing.py");
    expect(els.importError.textContent).toMatch(/could not find that file/);
    expect(els.githubForm.hidden).toBe(false);
    expect(els.githubLoad.textContent).toBe("Load");
    expect(els.githubLoad.disabled).toBe(false);
  });

  test("the Load button shows progress (U12)", async () => {
    let resolve;
    mount(vi.fn(() => new Promise((r) => (resolve = r))));
    const pending = app.actions.importGithub("github.com/a/b/blob/main/x.py");
    expect(els.githubLoad.textContent).toBe("Loading…");
    expect(els.githubLoad.disabled).toBe(true);
    resolve(githubResponse("x = 1"));
    await pending;
    expect(els.githubLoad.textContent).toBe("Load");
  });
});

describe("line range, comments and forgetting", () => {
  test("changing the range updates and remembers the target", async () => {
    mount();
    await app.actions.importLocalFile(new File(["a = 1\nb = 2\nc = 3\nd = 4"], "x.py"));
    els.rangeStart.value = "2";
    els.rangeEnd.value = "3";
    els.rangeEnd.dispatchEvent(new Event("change"));
    expect(typedTarget()).toBe("b = 2\nc = 3");
    expect(JSON.parse(localStorage.getItem("codetype-last-import")).range).toEqual({
      start: 2,
      end: 3,
    });
    els.rangeStart.value = "1";
    els.rangeEnd.value = "4";
    els.rangeEnd.dispatchEvent(new Event("change"));
    expect(app.store.get().item.range).toBeNull();
  });

  test("Skip comments applies to examples too and can be turned off", () => {
    mount();
    app.actions.selectSource("shell-rustup");
    expect(typedTarget()).not.toContain("# NOTE");
    els.skipCommentsToggle.click();
    expect(typedTarget()).toContain("# NOTE: you are required to exit yourself");
    expect(localStorage.getItem("codetype-skip-comments")).toBe("off");
  });

  test("Forget import removes the file and disables the option (U11, R6)", async () => {
    mount();
    await app.actions.importLocalFile(new File(["a = 1"], "x.py"));
    els.forgetImport.click();
    expect(localStorage.getItem("codetype-last-import")).toBeNull();
    expect(app.store.get().item.id).toBe("python-stdlib");
    expect(els.sourceSelect.querySelector('option[value="custom"]').disabled).toBe(true);
    expect(els.forgetImport.disabled).toBe(true);
    expect(els.noticeText.textContent).toMatch(/removed/);
    els.noticeDismiss.click();
    expect(els.notice.dataset.empty).toBe("true");
  });

  test("a saved v1 import is migrated on load (R4)", () => {
    localStorage.setItem(
      "codetype-last-import",
      JSON.stringify({
        id: "custom",
        filename: "old.rs",
        repo: "old.rs",
        path: "/ local file · comments skipped",
        icon: "x",
        code: "fn main() {}",
      }),
    );
    mount();
    expect(app.store.get().item).toMatchObject({ version: 2, language: "rust" });
    expect(JSON.parse(localStorage.getItem("codetype-last-import")).version).toBe(2);
    expect(typedTarget()).toBe("fn main() {}");
  });

  test("a corrupt saved import is discarded", () => {
    localStorage.setItem("codetype-last-import", "{not json");
    mount();
    expect(localStorage.getItem("codetype-last-import")).toBeNull();
    expect(app.store.get().item.id).toBe("python-stdlib");
  });
});
