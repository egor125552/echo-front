export const manifest = {
  id: "developer-settings-ui",
  requires: ["cloudflare-session"],
};

const REASON_LABELS = {
  "vehicle-eject": "Вылет из машины",
  "vehicle-crash": "Авария машины",
  "vehicle-hit": "Удар машиной",
  "high-fall": "Высокое падение",
  "building-impact": "Удар о здание",
  "parkour-pose": "Поза паркура",
  death: "Смерть",
  default: "Обычный ragdoll",
};


const SPEED_MODE_LABELS = {
  none: "Не зависит от скорости",
  horizontal: "Скорость по земле",
  vertical: "Вертикальная скорость",
  total: "Полная скорость",
};

const PRIORITY_LABELS = {
  recommended: "Главная настройка",
  normal: "Дополнительная настройка",
  advanced: "Тонкая настройка",
};

export async function setup(ctx) {
  const network = ctx.services.get("network");
  let panel = null;
  let fields = {};
  let category = null;
  let parachuteCategory = null;
  let parachuteFields = {};
  let stabilityCategory = null;
  let hostAllowed = false;
  let lastJournalRevision = 0;
  let lastRagdollJournalKey = "";

  function journalEvent(event, payload = {}) {
    ctx.events.emit("game:event", {
      event,
      payload: {
        developerSettings: true,
        ...payload,
      },
    });
  }

  function journalSettingsState(revision) {
    if (!revision || revision === lastJournalRevision || !category) return;
    lastJournalRevision = revision;
    const selectedReason = panel?.querySelector("#developer-ragdoll-reason")?.value ?? null;
    journalEvent("developer:settings-state", {
      revision,
      selectedReason,
      ragdollProfile: selectedReason ? category.profiles?.[selectedReason] ?? null : null,
      ragdollSelfCollisionEnabled: stabilityCategory?.values?.selfCollisionEnabled ?? null,
      parachute: parachuteCategory?.values ? { ...parachuteCategory.values } : null,
    });
  }

  function journalAppliedRagdoll(value) {
    if (!value) return;
    const overlay = value.parkourOverlay ?? null;
    const key = [
      value.entityId ?? "",
      value.reason ?? "",
      value.tunedAt ?? "",
      overlay?.angularSpeed ?? "",
      value.active ? "1" : "0",
    ].join(":");
    if (!key || key === lastRagdollJournalKey) return;
    lastRagdollJournalKey = key;
    journalEvent("developer:ragdoll-applied", {
      entityId: value.entityId ?? null,
      reason: value.reason ?? null,
      active: Boolean(value.active),
      bodies: value.bodies ?? null,
      profile: value.profile ? { ...value.profile } : null,
      tumble: value.tumble ? { ...value.tumble } : null,
      scale: value.scale ?? null,
      tumbleRadiansPerSecond: value.tumbleRadiansPerSecond ?? null,
      tumbleRevolutionsPerSecond: value.tumbleRevolutionsPerSecond ?? null,
      horizontalSpeedKph: value.horizontalSpeedKph ?? null,
      verticalSpeedKph: value.verticalSpeedKph ?? null,
      totalSpeedKph: value.totalSpeedKph ?? null,
      parkourSpinMultiplier: value.parkourSpinMultiplier ?? null,
      parkourOverlay: overlay ? { ...overlay } : null,
    });
  }

  function status(text) {
    const node = panel?.querySelector("#developer-settings-status");
    if (node) node.textContent = text;
  }

  function send(action, payload = {}) {
    const ok = network.send("input", {
      input: {
        developerSettings: {
          action,
          ...payload,
        },
      },
    });
    if (!ok) status("Нет соединения с матчем");
    return ok;
  }

  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement("details");
    panel.id = "developer-settings-panel";
    panel.hidden = true;
    panel.innerHTML =
      '<summary>Режим разработчика</summary>' +
      '<div class="settings-grid">' +
      '<p>Временный режим настройки. Изменения действуют только в текущем матче и серверные параметры влияют на всех игроков этого матча.</p>' +
      '<label class="setting-row" for="developer-ragdoll-reason">' +
      '<span>Ситуация Ragdoll</span>' +
      '<select id="developer-ragdoll-reason"></select>' +
      '</label>' +
      '<div id="developer-ragdoll-fields" class="settings-grid"></div>' +
      '<button id="developer-ragdoll-apply" type="button">Применить параметры Ragdoll</button>' +
      '<button id="developer-ragdoll-reset" type="button">Сбросить выбранный профиль</button>' +
      '<label class="setting-row" for="developer-ragdoll-test-height">' +
      '<span>Высота тестового Ragdoll, метров</span>' +
      '<input id="developer-ragdoll-test-height" type="number" min="2" max="20" step="1" value="8" inputmode="decimal">' +
      '<small>Тело создаётся выше текущей позиции, чтобы вращение успело проявиться до первого удара.</small>' +
      '</label>' +
      '<label class="setting-row" for="developer-ragdoll-test-speed">' +
      '<span>Тестовая скорость вперёд, метров в секунду</span>' +
      '<input id="developer-ragdoll-test-speed" type="number" min="0" max="20" step="0.5" value="6" inputmode="decimal">' +
      '<small>Одинаковая скорость делает сравнение профилей честнее.</small>' +
      '</label>' +
      '<button id="developer-ragdoll-test" type="button">Запустить тест выбранного Ragdoll</button>' +
      '<button id="developer-ragdoll-reset-all" type="button">Сбросить все профили Ragdoll</button>' +
      '<p id="developer-settings-note"></p>' +
      '<div id="developer-ragdoll-diagnostics" aria-live="polite" aria-atomic="true">' +
      '<strong>Последний реально применённый Ragdoll</strong>' +
      '<p id="developer-ragdoll-diagnostics-text">Пока нет данных. Активируй ragdoll после изменения параметров.</p>' +
      '</div>' +
      '<hr>' +
      '<h3>Стабильность Ragdoll</h3>' +
      '<p id="developer-ragdoll-stability-note"></p>' +
      '<label class="setting-row" for="developer-ragdoll-self-collision">' +
      '<span>Самоколлизия частей тела</span>' +
      '<input id="developer-ragdoll-self-collision" type="checkbox">' +
      '<small id="developer-ragdoll-self-collision-description"></small>' +
      '</label>' +
      '<button id="developer-ragdoll-stability-apply" type="button">Применить стабильность Ragdoll</button>' +
      '<button id="developer-ragdoll-stability-reset" type="button">Сбросить стабильность Ragdoll</button>' +
      '<p id="developer-ragdoll-stability-diagnostics" aria-live="polite" aria-atomic="true"></p>' +
      '<hr>' +
      '<h3>Парашют</h3>' +
      '<p id="developer-parachute-note"></p>' +
      '<div id="developer-parachute-fields" class="settings-grid"></div>' +
      '<button id="developer-parachute-apply" type="button">Применить параметры парашюта</button>' +
      '<button id="developer-parachute-reset" type="button">Сбросить параметры парашюта</button>' +
      '<div aria-live="polite" aria-atomic="true">' +
      '<strong>Текущее состояние парашюта</strong>' +
      '<p id="developer-parachute-diagnostics-text">Сейчас парашют не активен.</p>' +
      '</div>' +
      '<p id="developer-settings-status" role="status" aria-live="polite" aria-atomic="true"></p>' +
      '</div>';
    const technicalTools = document.querySelector("#technical-tools-content");
    const gamePanel = document.querySelector("#game-panel");
    if (technicalTools) technicalTools.append(panel);
    else gamePanel?.after(panel);

    panel.querySelector("#developer-ragdoll-reason")?.addEventListener("change", () => {
      renderFields();
      renderSelectedProfile();
    });
    panel.querySelector("#developer-ragdoll-apply")?.addEventListener("click", () => {
      if (!category) return;
      const reason = panel.querySelector("#developer-ragdoll-reason")?.value;
      const patch = {};
      for (const [name, input] of Object.entries(fields)) {
        patch[name] = input.tagName === "SELECT" ? input.value : Number(input.value);
      }
      status("Применяю параметры");
      send("set-ragdoll-profile", { reason, patch });
    });
    panel.querySelector("#developer-ragdoll-reset")?.addEventListener("click", () => {
      const reason = panel.querySelector("#developer-ragdoll-reason")?.value;
      status("Сбрасываю профиль");
      send("reset-ragdoll-profile", { reason });
    });
    panel.querySelector("#developer-ragdoll-test")?.addEventListener("click", () => {
      const reason = panel.querySelector("#developer-ragdoll-reason")?.value;
      const height = Number(panel.querySelector("#developer-ragdoll-test-height")?.value);
      const speed = Number(panel.querySelector("#developer-ragdoll-test-speed")?.value);
      status("Запускаю тестовый Ragdoll");
      send("test-ragdoll", { reason, height, speed });
    });

    panel.querySelector("#developer-ragdoll-reset-all")?.addEventListener("click", () => {
      status("Сбрасываю все профили Ragdoll");
      send("reset-all-ragdoll");
    });
    panel.querySelector("#developer-ragdoll-stability-apply")?.addEventListener("click", () => {
      const checkbox = panel.querySelector("#developer-ragdoll-self-collision");
      status("Применяю стабильность Ragdoll");
      send("set-ragdoll-stability", {
        patch: { selfCollisionEnabled: Boolean(checkbox?.checked) },
      });
    });
    panel.querySelector("#developer-ragdoll-stability-reset")?.addEventListener("click", () => {
      status("Сбрасываю стабильность Ragdoll");
      send("reset-ragdoll-stability");
    });

    panel.querySelector("#developer-parachute-apply")?.addEventListener("click", () => {
      if (!parachuteCategory) return;
      const patch = {};
      for (const [name, input] of Object.entries(parachuteFields)) {
        patch[name] = Number(input.value);
      }
      status("Применяю параметры парашюта");
      send("set-parachute", { patch });
    });
    panel.querySelector("#developer-parachute-reset")?.addEventListener("click", () => {
      status("Сбрасываю параметры парашюта");
      send("reset-parachute");
    });
    return panel;
  }

  function renderFields() {
    const container = panel.querySelector("#developer-ragdoll-fields");
    container.replaceChildren();
    fields = {};
    const reason = panel.querySelector("#developer-ragdoll-reason")?.value;
    const effective = new Set(category.effectiveFieldsByReason?.[reason] ?? Object.keys(category.fields));
    for (const [name, spec] of Object.entries(category.fields)) {
      if (!effective.has(name)) continue;
      const label = document.createElement("label");
      label.className = "setting-row";
      const title = document.createElement("span");
      const priority = PRIORITY_LABELS[spec.priority] ?? null;
      title.textContent = priority ? spec.label + ". " + priority : spec.label;
      const description = document.createElement("small");
      description.id = "developer-ragdoll-" + name + "-description";
      description.textContent = spec.description ?? "";
      let input;
      if (spec.type === "select") {
        input = document.createElement("select");
        for (const optionValue of spec.options ?? []) {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = SPEED_MODE_LABELS[optionValue] ?? optionValue;
          input.append(option);
        }
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);
        input.inputMode = "decimal";
      }
      input.id = "developer-ragdoll-" + name;
      label.htmlFor = input.id;
      if (spec.description) input.setAttribute("aria-describedby", description.id);
      label.append(title, input);
      if (spec.description) label.append(description);
      container.append(label);
      fields[name] = input;
    }
  }

  function renderStability() {
    if (!stabilityCategory) return;
    const field = stabilityCategory.fields?.selfCollisionEnabled ?? {};
    const checkbox = panel.querySelector("#developer-ragdoll-self-collision");
    const description = panel.querySelector("#developer-ragdoll-self-collision-description");
    const note = panel.querySelector("#developer-ragdoll-stability-note");
    if (checkbox) {
      checkbox.checked = Boolean(stabilityCategory.values?.selfCollisionEnabled);
      if (field.description) {
        checkbox.setAttribute("aria-describedby", "developer-ragdoll-self-collision-description");
      }
    }
    if (description) description.textContent = field.description ?? "";
    if (note) note.textContent = stabilityCategory.note ?? "";

    renderStabilityDiagnostics(stabilityCategory.diagnostics ?? null);
  }

  function renderStabilityDiagnostics(diagnostics) {
    if (!diagnostics) return;
    const active = Array.isArray(diagnostics.active) ? diagnostics.active : [];
    const totalClamps = active.reduce(
      (sum, group) => sum + (Number(group.energyClamps) || 0),
      0,
    );
    const totalContacts = active.reduce(
      (sum, group) => sum + (Number(group.intraGroupContacts) || 0),
      0,
    );
    const unstable = active.some((group) => Boolean(group.nonFinite));
    const diagnosticNode = panel.querySelector("#developer-ragdoll-stability-diagnostics");
    if (diagnosticNode) {
      diagnosticNode.textContent = [
        "Активных ragdoll-групп: " + (Number(diagnostics.activeGroups) || 0) + ".",
        "Физических тел в группах: " + (Number(diagnostics.groupedBodies) || 0) + ".",
        "Внутренних контактов частей тела сейчас: " + totalContacts + ".",
        "Срабатываний защитного ограничения энергии: " + totalClamps + ".",
        diagnostics.selfCollisionEnabled ? "Самоколлизия включена." : "Самоколлизия выключена.",
        unstable ? "Внимание: обнаружено некорректное физическое значение." : "Физика остаётся конечной.",
      ].join(" ");
    }
  }

  function renderParachuteFields() {
    const container = panel.querySelector("#developer-parachute-fields");
    container.replaceChildren();
    parachuteFields = {};
    if (!parachuteCategory) return;

    for (const [name, spec] of Object.entries(parachuteCategory.fields ?? {})) {
      const label = document.createElement("label");
      label.className = "setting-row";
      const title = document.createElement("span");
      const priority = PRIORITY_LABELS[spec.priority] ?? null;
      title.textContent = priority ? spec.label + ". " + priority : spec.label;

      const description = document.createElement("small");
      description.id = "developer-parachute-" + name + "-description";
      description.textContent = spec.description ?? "";

      const input = document.createElement("input");
      input.type = "number";
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.inputMode = "decimal";
      input.id = "developer-parachute-" + name;
      input.value = String(parachuteCategory.values?.[name] ?? 1);
      label.htmlFor = input.id;
      if (spec.description) input.setAttribute("aria-describedby", description.id);

      label.append(title, input);
      if (spec.description) label.append(description);
      container.append(label);
      parachuteFields[name] = input;
    }

    panel.querySelector("#developer-parachute-note").textContent = parachuteCategory.note ?? "";
  }

  function renderParachuteDiagnostics(value) {
    const node = panel?.querySelector("#developer-parachute-diagnostics-text");
    if (!node) return;
    const state = value?.state;
    if (!state?.airborne) {
      node.textContent = "Сейчас парашют не активен.";
      return;
    }
    node.textContent = [
      "Фаза: " + (state.phase ?? "неизвестно") + ".",
      "Высота: " + formatNumber(state.altitude, 1) + " м.",
      "Вертикальная скорость: " + formatNumber(state.verticalVelocity, 2) + " м/с.",
      "Реальная скорость снижения: " + formatNumber(state.downwardSpeed, 2) + " м/с.",
      state.phase === "freefall"
        ? "Горизонтальная скорость свободного падения: " + formatNumber(state.freefallHorizontalSpeed, 2) + " м/с."
        : "Скорость планирования: " + formatNumber(state.glideSpeed, 2) + " м/с.",
      "Полная воздушная скорость: " + formatNumber(state.airSpeed, 2) + " м/с.",
      "Ветер: " + formatNumber(state.windSpeed, 2) + " м/с.",
      "Наполнение купола: " + formatNumber((state.inflation ?? 0) * 100, 0) + " процентов.",
      state.landingApproach ? "Режим захода на посадку активен." : "Обычный полёт.",
    ].join(" ");
  }

  function renderSelectedProfile() {
    if (!category) return;
    const reason = panel.querySelector("#developer-ragdoll-reason")?.value;
    const profile = category.profiles?.[reason];
    if (!profile) return;
    for (const [name, input] of Object.entries(fields)) {
      const value = profile[name];
      if (value !== undefined) input.value = String(value);
    }
  }

  function formatNumber(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "нет данных";
  }

  function renderAppliedRagdoll(value) {
    const node = panel?.querySelector("#developer-ragdoll-diagnostics-text");
    if (!node) return;
    if (!value) {
      node.textContent = "Пока нет данных. Активируй ragdoll после изменения параметров.";
      return;
    }
    const reason = REASON_LABELS[value.reason] ?? value.reason ?? "неизвестно";
    const profile = value.profile ?? {};
    const tumble = value.tumble ?? {};
    const parts = [
      "Причина: " + reason + ".",
      value.active ? "Ragdoll сейчас активен." : "Показан последний завершённый Ragdoll.",
      "Применено тел: " + (value.bodies ?? "неизвестно") + ".",
      "Коэффициент усиления от скорости: " + formatNumber(value.scale) + ".",
      "Скорость по земле: " + formatNumber(value.horizontalSpeedKph, 1) + " км/ч.",
      "Вертикальная скорость: " + formatNumber(value.verticalSpeedKph, 1) + " км/ч.",
      "Итоговое вращение X " + formatNumber(tumble.x) +
        ", Y " + formatNumber(tumble.y) +
        ", Z " + formatNumber(tumble.z) + ".",
      "Угловая скорость: " + formatNumber(value.tumbleRevolutionsPerSecond) + " оборота в секунду.",
      "Трение " + formatNumber(profile.friction) +
        ", угловое затухание " + formatNumber(profile.angularDamping, 3) + ".",
    ];
    if (value.parkourNote) parts.push(value.parkourNote);
    node.textContent = parts.join(" ");
  }

  function renderCatalog(data) {
    const activeElement = document.activeElement;
    const activeId = activeElement?.id ?? null;
    const activeSelectionStart = typeof activeElement?.selectionStart === "number"
      ? activeElement.selectionStart
      : null;
    const activeSelectionEnd = typeof activeElement?.selectionEnd === "number"
      ? activeElement.selectionEnd
      : null;

    category = data?.categories?.find((entry) => entry.id === "ragdoll") ?? null;
    stabilityCategory = data?.categories?.find((entry) => entry.id === "ragdoll-stability") ?? null;
    parachuteCategory = data?.categories?.find((entry) => entry.id === "parachute") ?? null;
    if (!category) {
      status("Категория Ragdoll недоступна");
      return;
    }
    const select = panel.querySelector("#developer-ragdoll-reason");
    const previousReason = select.value;
    select.replaceChildren();
    for (const reason of category.reasons ?? []) {
      const option = document.createElement("option");
      option.value = reason;
      option.textContent = REASON_LABELS[reason] ?? reason;
      select.append(option);
    }
    if ((category.reasons ?? []).includes(previousReason)) select.value = previousReason;
    panel.querySelector("#developer-settings-note").textContent = category.note ?? "";
    renderFields();
    renderSelectedProfile();
    renderStability();
    renderParachuteFields();

    if (activeId) {
      const restored = document.getElementById(activeId);
      if (restored && !restored.disabled) {
        restored.focus({ preventScroll: true });
        if (activeSelectionStart !== null
          && activeSelectionEnd !== null
          && typeof restored.setSelectionRange === "function") {
          try {
            restored.setSelectionRange(activeSelectionStart, activeSelectionEnd);
          } catch {
            // Number inputs do not support text selection in every browser.
          }
        }
      }
    }

    status("Параметры загружены");
  }

  buildPanel();

  let lastRevision = 0;
  ctx.events.on("game:snapshot", (snapshot) => {
    const developer = snapshot?.developerSettings;
    const allowed = Boolean(snapshot?.social?.isHost) && network.mode === "battle-royale" && developer?.enabled;
    hostAllowed = allowed;
    panel.hidden = !allowed;
    if (!allowed) return;

    if (developer.error) status("Ошибка: " + developer.error);
    else if (developer.message) status(developer.message);
    renderAppliedRagdoll(developer.appliedRagdoll);
    renderStabilityDiagnostics(developer.ragdollStability);
    renderParachuteDiagnostics(developer.parachute);
    journalAppliedRagdoll(developer.appliedRagdoll);

    const revision = Number(developer.revision) || 0;
    if (revision !== lastRevision && developer.catalog) {
      lastRevision = revision;
      renderCatalog(developer.catalog);
      journalSettingsState(revision);
    }
  });
}
