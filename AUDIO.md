# Аудио Echo Front

Постоянная базовая папка: `assets/audio/core/`.

Стабильные пути:

- `assets/audio/core/automatic-shot.mp3` — выстрел автомата.
- `assets/audio/core/pistol-shot.mp3` — выстрел пистолета.
- `assets/audio/core/death-full.mp3` — смерть игрока.
- `assets/audio/core/step-1.mp3` — шаг 1.
- `assets/audio/core/step-2.mp3` — шаг 2.
- `assets/audio/core/step-3.mp3` — шаг 3.
- `assets/audio/core/step-4.mp3` — шаг 4.

Эти имена считаются стабильными API-путями для игровых плагинов. Код механик не должен искать исходные файлы в старых репозиториях: он обращается только к этим путям.

Импорт выполняется workflow `.github/workflows/import-core-audio.yml`. Он берёт текущие базовые звуки из Архипелага, а для пистолета использует ту же исходную запись, которую загружает Архипелаг.
