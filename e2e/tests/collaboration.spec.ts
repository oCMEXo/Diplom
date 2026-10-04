import { expect, test } from "@playwright/test";
import {
  createFile,
  createProject,
  editorText,
  guest,
  join,
  openAs,
  register,
  setInviteRole,
  typeInEditor,
} from "./helpers.js";

test("two people edit one file and see each other's changes live", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Совместный проект");
  const file = await createFile(request, owner, project.id, "main.py");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${file.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);
  await expect(ownerPage.getByText("Синхронизировано")).toBeVisible();
  await expect(guestPage.getByText("Синхронизировано")).toBeVisible();

  await typeInEditor(ownerPage, "x = 'from owner'");
  await expect.poll(() => editorText(guestPage)).toContain("from owner");

  await guestPage.keyboard.press("Control+End");
  await typeInEditor(guestPage, " # and guest");
  await expect.poll(() => editorText(ownerPage)).toContain("and guest");
  expect(await editorText(guestPage)).toBe(await editorText(ownerPage));
});

test("a read-only invite lets someone watch but not change the file", async ({
  browser,
  request,
}) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Только чтение");
  const file = await createFile(request, owner, project.id, "main.py");
  await setInviteRole(request, owner, project.id, "viewer");
  const watcher = await guest(request, "Наблюдатель");
  await join(request, watcher, project.inviteCode);

  const path = `/projects/${project.id}/files/${file.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const watcherPage = await openAs(browser, watcher, path);

  await typeInEditor(ownerPage, "print('visible to all')");
  await expect.poll(() => editorText(watcherPage)).toContain("visible to all");
  await expect(watcherPage.getByText("Только чтение").first()).toBeVisible();

  await watcherPage.locator(".monaco-editor").first().click();
  await watcherPage.keyboard.type("HACKED");
  await ownerPage.waitForTimeout(1500);
  expect(await editorText(ownerPage)).not.toContain("HACKED");
});

test("chat messages and presence reach everyone in the project", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Чат");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const ownerPage = await openAs(browser, owner, `/projects/${project.id}`);
  const guestPage = await openAs(browser, visitor, `/projects/${project.id}`);

  await expect(ownerPage.getByTitle("в сети")).toHaveCount(2);

  await ownerPage.getByPlaceholder("Сообщение...").fill("привет из e2e");
  await ownerPage.keyboard.press("Enter");
  await expect(guestPage.getByText("привет из e2e")).toBeVisible();
});

test("a markdown document renders a live preview for everyone", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Документы");
  const doc = await createFile(request, owner, project.id, "README.md", "doc");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${doc.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);

  await typeInEditor(ownerPage, "# Заголовок задания");
  await expect(guestPage.locator(".markdown-body h1")).toHaveText("Заголовок задания");
});

test("code run output is shared with everyone in the project", async ({ browser, request }) => {
  test.skip(process.env.E2E_RUNNER !== "1", "needs the runner service and Docker");

  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Запуск");
  const file = await createFile(request, owner, project.id, "main.py");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${file.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);

  await typeInEditor(ownerPage, "print(6 * 7)");
  await ownerPage.getByRole("button", { name: "Запустить" }).click();

  await expect(guestPage.locator("pre")).toContainText("42", { timeout: 40_000 });
  await expect(ownerPage.locator("pre")).toContainText("42");
});

test("a shape drawn on the board appears for everyone and can be undone", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Доска");
  const board = await createFile(request, owner, project.id, "ideas.board", "board");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const path = `/projects/${project.id}/files/${board.id}`;
  const ownerPage = await openAs(browser, owner, path);
  const guestPage = await openAs(browser, visitor, path);
  const ownerBoard = ownerPage.locator("[data-shape-count]");
  const guestBoard = guestPage.locator("[data-shape-count]");
  await expect(ownerBoard).toHaveAttribute("data-shape-count", "0");

  await ownerPage.getByRole("button", { name: "Прямоугольник" }).click();
  const canvas = ownerPage.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("board canvas is not visible");
  await ownerPage.mouse.move(box.x + 80, box.y + 80);
  await ownerPage.mouse.down();
  await ownerPage.mouse.move(box.x + 220, box.y + 180, { steps: 8 });
  await ownerPage.mouse.up();

  await expect(ownerBoard).toHaveAttribute("data-shape-count", "1");
  await expect(guestBoard).toHaveAttribute("data-shape-count", "1");

  await ownerPage.getByRole("button", { name: "Отменить" }).click();
  await expect(guestBoard).toHaveAttribute("data-shape-count", "0");
});

test("a file can be created from the sidebar and the theme choice is remembered", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Интерфейс");
  const page = await openAs(browser, owner, `/projects/${project.id}`);

  await page.getByRole("button", { name: "Создать файл" }).click();
  await page.getByRole("radio", { name: "Документ" }).click();
  await page.getByLabel("Имя файла").fill("заметки.md");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("link", { name: "заметки.md" })).toBeVisible();
  await expect(page).toHaveURL(/\/files\//);

  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const before = await theme();
  await page.getByRole("button", { name: "Меню профиля" }).click();
  await page.getByRole("menuitem", { name: /тема/ }).click();
  const after = await theme();
  expect(after).not.toBe(before);

  await page.reload();
  expect(await theme()).toBe(after);
});

test("a public GitHub repository can be imported into a new project", async ({ browser, request }) => {
  const github = await request.get("https://codeload.github.com/octocat/Hello-World/zip/HEAD").catch(() => null);
  test.skip(!github?.ok(), "needs network access to GitHub");

  const owner = await register(request, "Аня");
  const page = await openAs(browser, owner, "/");

  await page.getByRole("button", { name: "Новый проект" }).first().click();
  await page.getByRole("radio", { name: "Из GitHub" }).click();
  await page.getByLabel("Ссылка на репозиторий").fill("https://github.com/octocat/Hello-World");
  await page.getByRole("button", { name: "Создать и импортировать" }).click();

  await expect(page).toHaveURL(/\/projects\//);
  const file = page.getByRole("link", { name: "README" });
  await expect(file).toBeVisible();
  await file.click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("Hello World!");
});

test("a file can be deleted from the sidebar after confirmation", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Уборка");
  await createFile(request, owner, project.id, "лишний.py");
  const page = await openAs(browser, owner, `/projects/${project.id}`);

  const file = page.getByRole("link", { name: "лишний.py" });
  await expect(file).toBeVisible();
  await file.hover();
  await page.getByRole("button", { name: "Удалить лишний.py" }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(file).toHaveCount(0);
});

test("a wrong GitHub token is explained before anything is sent", async ({ browser, request }) => {
  const github = await request.get("https://api.github.com/zen").catch(() => null);
  test.skip(!github?.ok(), "needs network access to GitHub");

  const owner = await register(request, "Аня");
  const page = await openAs(browser, owner, "/");
  await page.getByRole("button", { name: "Новый проект" }).first().click();
  await page.getByRole("radio", { name: "Из GitHub" }).click();
  await page.getByLabel("Ссылка на репозиторий").fill("https://github.com/octocat/Hello-World");
  await page.getByRole("button", { name: "Создать и импортировать" }).click();
  await expect(page.getByRole("link", { name: "README" })).toBeVisible();

  await page.getByRole("button", { name: "Отправить в GitHub" }).click();
  await page.getByLabel("Токен GitHub").fill("ghp_definitely_not_a_real_token_0000");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("GitHub не принял токен")).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole("button", { name: "Отправить", exact: true })).toBeDisabled();
});

test("files are shown in folders that can be folded", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Папки");
  await createFile(request, owner, project.id, "package.json");
  await createFile(request, owner, project.id, "contracts/Lock.sol");
  await createFile(request, owner, project.id, "logs/2025/run.log");
  const page = await openAs(browser, owner, `/projects/${project.id}`);

  await expect(page.getByRole("button", { name: "contracts", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lock.sol" })).toBeVisible();
  await expect(page.getByRole("link", { name: "run.log" })).toBeVisible();

  await page.getByRole("button", { name: "contracts", exact: true }).click();
  await expect(page.getByRole("link", { name: "Lock.sol" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "package.json" })).toBeVisible();
});

test("a project can be deleted by its owner and left by a guest", async ({ browser, request }) => {
  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Старый проект");
  const visitor = await guest(request, "Влад");
  await join(request, visitor, project.inviteCode);

  const guestPage = await openAs(browser, visitor, "/");
  await expect(guestPage.getByText("Старый проект")).toBeVisible();
  await guestPage.getByText("Старый проект").hover();
  await guestPage.getByRole("button", { name: "Покинуть проект Старый проект" }).click();
  await guestPage.getByRole("button", { name: "Покинуть", exact: true }).click();
  await expect(guestPage.getByText("Старый проект")).toHaveCount(0);

  const ownerPage = await openAs(browser, owner, "/");
  await ownerPage.getByText("Старый проект").hover();
  await ownerPage.getByRole("button", { name: "Удалить проект Старый проект" }).click();
  await ownerPage.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(ownerPage.getByText("Старый проект")).toHaveCount(0);
});

test("code run can import other files of the project", async ({ browser, request }) => {
  test.skip(process.env.E2E_RUNNER !== "1", "needs the runner service and Docker");

  const owner = await register(request, "Аня");
  const project = await createProject(request, owner, "Модули");
  const helper = await createFile(request, owner, project.id, "logger.js");
  const main = await createFile(request, owner, project.id, "main.js");

  const helperPage = await openAs(browser, owner, `/projects/${project.id}/files/${helper.id}`);
  await typeInEditor(helperPage, "module.exports = (text) => console.log('[log] ' + text);");
  await expect(helperPage.getByText("Синхронизировано")).toBeVisible();
  await helperPage.waitForTimeout(3500);

  const page = await openAs(browser, owner, `/projects/${project.id}/files/${main.id}`);
  await typeInEditor(page, "require('./logger')('привет');");
  await page.getByRole("button", { name: "Запустить" }).click();
  await expect(page.locator("pre")).toContainText("[log] привет", { timeout: 40_000 });
});
