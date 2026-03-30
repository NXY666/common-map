import { formatDemoResult, runArchitectureDemo } from "./unified-map";

const app = document.querySelector<HTMLDivElement>("#app");

async function render(): Promise<void> {
  if (!app) {
    return;
  }

  const result = formatDemoResult(await runArchitectureDemo());

  app.innerHTML = `
    <main style="max-width: 1100px; margin: 0 auto; padding: 32px 20px; font-family: 'Iosevka Web', 'JetBrains Mono', Consolas, monospace; color: #12202f; background: linear-gradient(180deg, #f7f3ea 0%, #eef4f8 100%); min-height: 100vh;">
      <h1 style="margin: 0 0 16px; font-size: 28px;">Map abstraction skeleton</h1>
      <p style="margin: 0 0 20px; max-width: 820px; line-height: 1.6;">
        这份页面展示的是统一抽象层的骨架设计，不是实际 SDK 实现。核心关注点是 Map / Source / Layer / Overlay / Control / Adapter / Capability 之间的职责边界。
      </p>
      <pre style="margin: 0; padding: 20px; overflow: auto; border-radius: 18px; background: rgba(255, 255, 255, 0.78); border: 1px solid rgba(18, 32, 47, 0.12); line-height: 1.55; white-space: pre-wrap;">${result}</pre>
    </main>
  `;
}

void render();
