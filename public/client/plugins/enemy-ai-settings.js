export const manifest = {
  id: "enemy-ai-settings",
  version: "2.0.0",
  requires: ["cloudflare-session"],
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  const select = document.querySelector("#enemy-ai-mode");
  const statusEl = document.querySelector("#enemy-ai-status");

  const state = {
    mode: network.enemyAiMode || "standard",
    configured: null,
    usedRequests: 0,
    maxRequests: 10_000,
    remainingRequests: 10_000,
    activeUnitIds: [],
    activeAllyIds: [],
    activeEnemyIds: [],
    lastLatencyMs: null,
    lastEstimatedTokens: null,
    lastApiInputTokens: null,
    maxInputTokens: 30_000,
    lastError: null,
  };

  function formatQuota() {
    const used = Math.max(0, Number(state.usedRequests) || 0).toLocaleString("ru-RU");
    const max = Math.max(1, Number(state.maxRequests) || 10_000).toLocaleString("ru-RU");
    const left = Math.max(0, Number(state.remainingRequests) || 0).toLocaleString("ru-RU");
    return `Запросов: ${used} из ${max} (осталось ${left}).`;
  }

  function render() {
    if (select && select.value !== state.mode) {
      select.value = state.mode;
    }
    if (!statusEl) return;

    if (state.mode === "ai") {
      if (state.lastError) {
        const errText = String(state.lastError.message || state.lastError.code || "сбой запроса").replace(/\.+$/, "");
        statusEl.textContent = `Боты с ИИ (Gemini Decisions): ошибка — ${errText}. ${formatQuota()}`;
        return;
      }
      if (state.configured === false) {
        statusEl.textContent = `Выбран режим «Боты с ИИ (Gemini Decisions: враги и напарники)». Серверный ключ Gemini API не настроен: при подключении к бою боты сообщат об ошибке. ${formatQuota()}`;
        return;
      }
      const alliesCount = Array.isArray(state.activeAllyIds) ? state.activeAllyIds.length : 0;
      const enemiesCount = Array.isArray(state.activeEnemyIds) ? state.activeEnemyIds.length : 0;
      const activeTotal = Math.max(
        Array.isArray(state.activeUnitIds) ? state.activeUnitIds.length : 0,
        alliesCount + enemiesCount,
      );
      const countsText = activeTotal
        ? ` Под управлением ИИ: ${activeTotal} (напарников: ${alliesCount}, врагов: ${enemiesCount}).`
        : "";
      const tokenValue = state.lastApiInputTokens ?? state.lastEstimatedTokens;
      const tokenText = Number.isFinite(Number(tokenValue)) && Number(tokenValue) > 0
        ? ` Контекст: ${Math.round(Number(tokenValue)).toLocaleString("ru-RU")} / ${Math.round(Number(state.maxInputTokens) || 30_000).toLocaleString("ru-RU")} ток.`
        : "";
      const latency = Number.isFinite(Number(state.lastLatencyMs))
        ? ` Ответ: ${Math.round(Number(state.lastLatencyMs))} мс.`
        : "";
      statusEl.textContent = `Боты с ИИ (враги и напарники) включены.${countsText}${tokenText}${latency} ${formatQuota()}`;
      return;
    }

    statusEl.textContent = `Выбраны обычные боты (без расхода лимита ИИ). ${formatQuota()}`;
  }

  function applyServerState(next = {}) {
    if (!next || typeof next !== "object") return;
    if (typeof next.mode === "string") state.mode = next.mode === "ai" ? "ai" : "standard";
    if (typeof next.configured === "boolean") state.configured = next.configured;
    if (Number.isFinite(Number(next.usedRequests))) state.usedRequests = Number(next.usedRequests);
    if (Number.isFinite(Number(next.maxRequests))) state.maxRequests = Number(next.maxRequests);
    if (Number.isFinite(Number(next.remainingRequests))) {
      state.remainingRequests = Number(next.remainingRequests);
    } else {
      state.remainingRequests = Math.max(0, state.maxRequests - state.usedRequests);
    }
    if (Array.isArray(next.activeUnitIds)) state.activeUnitIds = next.activeUnitIds;
    if (Array.isArray(next.activeAllyIds)) state.activeAllyIds = next.activeAllyIds;
    if (Array.isArray(next.activeEnemyIds)) state.activeEnemyIds = next.activeEnemyIds;
    if (next.lastLatencyMs !== undefined) state.lastLatencyMs = next.lastLatencyMs;
    if (next.lastEstimatedTokens !== undefined) state.lastEstimatedTokens = next.lastEstimatedTokens;
    if (next.lastApiInputTokens !== undefined) state.lastApiInputTokens = next.lastApiInputTokens;
    if (Number.isFinite(Number(next.maxInputTokens))) state.maxInputTokens = Number(next.maxInputTokens);
    if ("lastError" in next) state.lastError = next.lastError ?? null;
    render();
  }

  function setMode(nextMode) {
    const applied = network.setEnemyAiMode(nextMode);
    state.mode = applied;
    if (applied === "standard") state.lastError = null;
    render();
    return applied;
  }

  select?.addEventListener("change", () => {
    setMode(select.value);
  });

  ctx.events.on("enemy-ai:mode-changed", ({ mode } = {}) => {
    state.mode = mode === "ai" ? "ai" : "standard";
    if (state.mode === "standard") state.lastError = null;
    render();
  });

  ctx.events.on("game:snapshot", (snapshot) => {
    if (snapshot?.aiEnemies) applyServerState(snapshot.aiEnemies);
  });

  ctx.events.on("game:event", (packet) => {
    const p = packet?.payload ?? {};
    if (packet?.event === "ai-decisions:mode-changed") {
      applyServerState({
        mode: p.mode,
        usedRequests: p.usedRequests,
        maxRequests: p.maxRequests,
        remainingRequests: p.remainingRequests,
        ...(p.mode === "standard" ? { lastError: null, activeUnitIds: [], activeAllyIds: [], activeEnemyIds: [] } : {}),
      });
    } else if (packet?.event === "ai-decisions:batch") {
      const summary = Array.isArray(p.summary) ? p.summary : [];
      const allyIds = summary.filter((s) => s.role && s.role !== "enemy").map((s) => s.entityId);
      const enemyIds = summary.filter((s) => !s.role || s.role === "enemy").map((s) => s.entityId);
      applyServerState({
        mode: "ai",
        usedRequests: p.usedRequests,
        maxRequests: p.maxRequests,
        remainingRequests: p.remainingRequests,
        lastLatencyMs: p.latencyMs,
        lastEstimatedTokens: p.estimatedInputTokens,
        lastApiInputTokens: p.apiInputTokens,
        maxInputTokens: p.maxInputTokens,
        lastError: null,
        activeUnitIds: summary.length ? summary.map((s) => s.entityId) : state.activeUnitIds,
        activeAllyIds: summary.length ? allyIds : state.activeAllyIds,
        activeEnemyIds: summary.length ? enemyIds : state.activeEnemyIds,
      });
    } else if (packet?.event === "ai-decisions:error") {
      applyServerState({
        usedRequests: p.usedRequests,
        maxRequests: p.maxRequests,
        remainingRequests: p.remainingRequests,
        lastError: { code: p.code, status: p.status, message: p.message, at: p.now },
      });
    }
  });

  render();

  if (typeof fetch === "function") {
    fetch("/api/ai-enemies", { cache: "no-store", headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          applyServerState({
            configured: data.configured,
            usedRequests: data.usedRequests,
            maxRequests: data.maxRequests,
            remainingRequests: data.remainingRequests,
          });
        }
      })
      .catch(() => {});
  }

  ctx.services.provide("enemy-ai-settings", {
    get mode() { return state.mode; },
    get state() { return { ...state }; },
    setMode,
  });
}
