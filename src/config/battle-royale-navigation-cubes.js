// Вручную расставленные невидимые навигационные кубы по всей карте Королевской битвы
// по принципу GTA San Andreas (отдельно дорожные кубы для машин и пехотные кубы для ботов и напарников).
// Координаты точно выверены под реальные здания, двери, лестницы, магазины, дороги и сектора карты.

export const MANUAL_BUILDING_BOUNDS = Object.freeze([
  // Главный склад (центр x: 60, z: 0, размер 30x24)
  { id: "warehouse", name: "Склад", minX: 45, maxX: 75, minZ: -12, maxZ: 12 },
  // Домик лесника (центр x: -110, z: -75, размер 12x10)
  { id: "forest-hut", name: "Домик лесника", minX: -116, maxX: -104, minZ: -80, maxZ: -70 },
  // Дом с припасами (центр x: -175, z: 95, размер 20x16)
  { id: "loot-house", name: "Дом с припасами", minX: -185, maxX: -165, minZ: 87, maxZ: 103 },
  // Двухэтажный дом (центр x: 135, z: 120, размер 18x14)
  { id: "two-storey-house", name: "Двухэтажный дом", minX: 126, maxX: 144, minZ: 113, maxZ: 127 },
]);

/**
 * Дорожные кубы для транспорта (Car Nodes):
 * - "intersection" — перекрёсток / развилка дорог
 * - "highway" — прямой скоростной участок трассы
 * - "perimeter" — куб объезда угла здания (чтобы машины не врезались в стены)
 * - "dropoff" — точка парковки и высадки у здания или магазина
 */
export const MANUAL_CAR_CUBES = Object.freeze([
  // === 1. ЦЕНТРАЛЬНАЯ ПЛОЩАДЬ И ЦЕНТРАЛЬНЫЙ МАГАЗИН (x: 0, z: -26) ===
  { id: "car-center-north", x: 0, z: -48, kind: "intersection", targetSpeed: 18, zone: "center-plaza" },
  { id: "car-center-shop-drop", x: 0, z: -36, kind: "dropoff", targetSpeed: 11, zone: "center-plaza" },
  { id: "car-center-west", x: -26, z: -26, kind: "intersection", targetSpeed: 17, zone: "center-plaza" },
  { id: "car-center-east", x: 24, z: -26, kind: "intersection", targetSpeed: 17, zone: "center-plaza" },
  { id: "car-center-hub", x: -4, z: 4, kind: "intersection", targetSpeed: 18, zone: "center-plaza" },
  { id: "car-center-south", x: 0, z: 32, kind: "intersection", targetSpeed: 19, zone: "center-plaza" },
  { id: "car-center-sw", x: -34, z: 22, kind: "highway", targetSpeed: 20, zone: "center-plaza" },
  { id: "car-center-nw", x: -36, z: -42, kind: "highway", targetSpeed: 20, zone: "center-plaza" },

  // === 2. ОБЪЕЗД ВОКРУГ ГЛАВНОГО СКЛАДА (x: 45..75, z: -12..12) И МАГАЗИНА У СКЛАДА (x: 82, z: 0) ===
  { id: "car-warehouse-nw", x: 30, z: -26, kind: "perimeter", targetSpeed: 14, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-north", x: 60, z: -28, kind: "dropoff", targetSpeed: 12, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-ne", x: 92, z: -26, kind: "perimeter", targetSpeed: 14, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-east-drop", x: 96, z: 0, kind: "dropoff", targetSpeed: 11, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-se", x: 92, z: 26, kind: "perimeter", targetSpeed: 14, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-south", x: 60, z: 28, kind: "dropoff", targetSpeed: 12, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-sw", x: 30, z: 26, kind: "perimeter", targetSpeed: 14, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-west-drop", x: 28, z: 0, kind: "dropoff", targetSpeed: 12, buildingId: "warehouse", zone: "warehouse" },
  { id: "car-warehouse-far-east", x: 124, z: 0, kind: "intersection", targetSpeed: 20, buildingId: "warehouse", zone: "warehouse" },

  // === 3. ОБЪЕЗД ВОКРУГ ДОМИКА ЛЕСНИКА (x: -116..-104, z: -80..-70) И МАГАЗИНА (x: -96, z: -75) ===
  { id: "car-forest-hut-nw", x: -132, z: -94, kind: "perimeter", targetSpeed: 14, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-north", x: -110, z: -96, kind: "dropoff", targetSpeed: 12, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-ne", x: -84, z: -92, kind: "perimeter", targetSpeed: 14, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-shop-drop", x: -80, z: -75, kind: "dropoff", targetSpeed: 11, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-se", x: -84, z: -58, kind: "perimeter", targetSpeed: 14, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-south", x: -110, z: -56, kind: "dropoff", targetSpeed: 12, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-sw", x: -132, z: -58, kind: "perimeter", targetSpeed: 14, buildingId: "forest-hut", zone: "forest-hut" },
  { id: "car-forest-hut-west", x: -134, z: -75, kind: "dropoff", targetSpeed: 12, buildingId: "forest-hut", zone: "forest-hut" },

  // === 4. ОБЪЕЗД ВОКРУГ ДОМА С ПРИПАСАМИ (x: -185..-165, z: 87..103), МАГАЗИНА (x: -158, z: 95) И ПЕСЧАНОЙ НИЗИНЫ ===
  { id: "car-loot-house-nw", x: -202, z: 72, kind: "perimeter", targetSpeed: 14, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-north", x: -175, z: 70, kind: "dropoff", targetSpeed: 12, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-ne", x: -146, z: 72, kind: "perimeter", targetSpeed: 14, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-shop-drop", x: -142, z: 95, kind: "dropoff", targetSpeed: 11, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-se", x: -146, z: 118, kind: "perimeter", targetSpeed: 14, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-south", x: -175, z: 120, kind: "dropoff", targetSpeed: 12, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-sw", x: -202, z: 118, kind: "perimeter", targetSpeed: 14, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-loot-house-west-drop", x: -204, z: 93, kind: "dropoff", targetSpeed: 12, buildingId: "loot-house", zone: "loot-house" },
  { id: "car-sand-basin-north", x: -225, z: 110, kind: "highway", targetSpeed: 18, zone: "sand-basin" },
  { id: "car-sand-basin-center", x: -195, z: 148, kind: "intersection", targetSpeed: 17, zone: "sand-basin" },
  { id: "car-sand-basin-east", x: -150, z: 148, kind: "highway", targetSpeed: 18, zone: "sand-basin" },
  { id: "car-sand-basin-south", x: -190, z: 185, kind: "intersection", targetSpeed: 19, zone: "sand-basin" },

  // === 5. ОБЪЕЗД ВОКРУГ ДВУХЭТАЖНОГО ДОМА (x: 126..144, z: 113..127) И МАГАЗИНА (x: 118, z: 120) ===
  { id: "car-two-storey-nw", x: 106, z: 98, kind: "perimeter", targetSpeed: 14, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-north", x: 135, z: 96, kind: "dropoff", targetSpeed: 12, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-ne", x: 162, z: 98, kind: "perimeter", targetSpeed: 14, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-east", x: 164, z: 120, kind: "dropoff", targetSpeed: 12, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-se", x: 162, z: 142, kind: "perimeter", targetSpeed: 14, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-south", x: 135, z: 144, kind: "dropoff", targetSpeed: 12, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-sw", x: 106, z: 142, kind: "perimeter", targetSpeed: 14, buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "car-two-storey-shop-drop", x: 102, z: 120, kind: "dropoff", targetSpeed: 11, buildingId: "two-storey-house", zone: "two-storey-house" },

  // === 6. ДОПОЛНИТЕЛЬНЫЙ ВОСТОЧНЫЙ АНГАР (x: 122..158, z: -34..-10) ===
  { id: "car-east-depot-nw", x: 108, z: -48, kind: "perimeter", targetSpeed: 15, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-north", x: 140, z: -50, kind: "dropoff", targetSpeed: 13, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-ne", x: 172, z: -48, kind: "perimeter", targetSpeed: 15, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-east", x: 174, z: -22, kind: "dropoff", targetSpeed: 13, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-se", x: 172, z: 4, kind: "perimeter", targetSpeed: 15, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-south", x: 140, z: 6, kind: "dropoff", targetSpeed: 13, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-sw", x: 108, z: 4, kind: "perimeter", targetSpeed: 15, buildingId: "warehouse-east", zone: "east-depot" },
  { id: "car-east-depot-west", x: 106, z: -22, kind: "dropoff", targetSpeed: 13, buildingId: "warehouse-east", zone: "east-depot" },

  // === 7. СВЯЗУЮЩИЕ ТРАССЫ МЕЖДУ БАЗАМИ (ВНУТРЕННЕЕ И СРЕДНЕЕ КОЛЬЦО) ===
  // Северо-западная трасса (Центр <-> Домик лесника)
  { id: "car-road-nw-1", x: -55, z: -50, kind: "highway", targetSpeed: 21, zone: "nw-road" },
  { id: "car-road-nw-2", x: -75, z: -32, kind: "highway", targetSpeed: 21, zone: "nw-road" },
  { id: "car-road-nw-3", x: -48, z: -85, kind: "intersection", targetSpeed: 20, zone: "nw-road" },
  { id: "car-road-nw-4", x: -82, z: -115, kind: "highway", targetSpeed: 22, zone: "nw-road" },
  { id: "car-road-nw-5", x: -145, z: -115, kind: "intersection", targetSpeed: 21, zone: "nw-road" },

  // Северная трасса (Северный хребет)
  { id: "car-road-north-1", x: 0, z: -88, kind: "intersection", targetSpeed: 22, zone: "north-road" },
  { id: "car-road-north-2", x: 45, z: -82, kind: "highway", targetSpeed: 22, zone: "north-road" },
  { id: "car-road-north-3", x: 90, z: -78, kind: "intersection", targetSpeed: 21, zone: "north-road" },
  { id: "car-road-north-4", x: -45, z: -130, kind: "highway", targetSpeed: 23, zone: "north-road" },
  { id: "car-road-north-5", x: 0, z: -140, kind: "intersection", targetSpeed: 23, zone: "north-road" },
  { id: "car-road-north-6", x: 55, z: -132, kind: "highway", targetSpeed: 23, zone: "north-road" },
  { id: "car-road-north-7", x: 110, z: -120, kind: "intersection", targetSpeed: 22, zone: "north-road" },

  // Юго-восточная трасса (Склад <-> Двухэтажный дом)
  { id: "car-road-se-1", x: 65, z: 62, kind: "intersection", targetSpeed: 21, zone: "se-road" },
  { id: "car-road-se-2", x: 96, z: 65, kind: "highway", targetSpeed: 21, zone: "se-road" },
  { id: "car-road-se-3", x: 132, z: 58, kind: "intersection", targetSpeed: 21, zone: "se-road" },
  { id: "car-road-se-4", x: 75, z: 102, kind: "highway", targetSpeed: 20, zone: "se-road" },
  { id: "car-road-se-5", x: 175, z: 65, kind: "highway", targetSpeed: 22, zone: "se-road" },

  // Южная трасса (Центр <-> Южная поляна)
  { id: "car-road-south-1", x: 25, z: 72, kind: "highway", targetSpeed: 21, zone: "south-road" },
  { id: "car-road-south-2", x: -25, z: 72, kind: "highway", targetSpeed: 21, zone: "south-road" },
  { id: "car-road-south-3", x: 0, z: 112, kind: "intersection", targetSpeed: 22, zone: "south-road" },
  { id: "car-road-south-4", x: 48, z: 135, kind: "highway", targetSpeed: 22, zone: "south-road" },
  { id: "car-road-south-5", x: -52, z: 125, kind: "highway", targetSpeed: 22, zone: "south-road" },
  { id: "car-road-south-6", x: 0, z: 165, kind: "intersection", targetSpeed: 23, zone: "south-road" },
  { id: "car-road-south-7", x: 68, z: 175, kind: "highway", targetSpeed: 23, zone: "south-road" },
  { id: "car-road-south-8", x: -95, z: 145, kind: "intersection", targetSpeed: 21, zone: "south-road" },

  // Западная и юго-западная трасса (Домик лесника <-> Центр <-> Дом с припасами)
  { id: "car-road-west-1", x: -75, z: 10, kind: "intersection", targetSpeed: 21, zone: "west-road" },
  { id: "car-road-west-2", x: -120, z: -12, kind: "highway", targetSpeed: 21, zone: "west-road" },
  { id: "car-road-west-3", x: -165, z: -25, kind: "intersection", targetSpeed: 21, zone: "west-road" },
  { id: "car-road-west-4", x: -165, z: 25, kind: "highway", targetSpeed: 21, zone: "west-road" },
  { id: "car-road-west-5", x: -115, z: 45, kind: "intersection", targetSpeed: 21, zone: "west-road" },
  { id: "car-road-west-6", x: -78, z: 68, kind: "highway", targetSpeed: 21, zone: "west-road" },
  { id: "car-road-west-7", x: -110, z: 95, kind: "intersection", targetSpeed: 20, zone: "west-road" },

  // === 8. ВНЕШНЕЕ ШОССЕ (РАДИУС 220..360М ПО ВСЕМ СТОРОНАМ СВЕТА) ===
  { id: "car-outer-n1", x: -180, z: -180, kind: "intersection", targetSpeed: 24, zone: "outer-highway" },
  { id: "car-outer-n2", x: -110, z: -210, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-n3", x: -35, z: -225, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-n4", x: 40, z: -225, kind: "intersection", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-n5", x: 115, z: -210, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-n6", x: 185, z: -175, kind: "intersection", targetSpeed: 24, zone: "outer-highway" },

  { id: "car-outer-e1", x: 220, z: -110, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-e2", x: 235, z: -35, kind: "intersection", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-e3", x: 235, z: 40, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-e4", x: 220, z: 115, kind: "intersection", targetSpeed: 24, zone: "outer-highway" },
  { id: "car-outer-e5", x: 190, z: 185, kind: "highway", targetSpeed: 24, zone: "outer-highway" },

  { id: "car-outer-s1", x: 125, z: 220, kind: "intersection", targetSpeed: 24, zone: "outer-highway" },
  { id: "car-outer-s2", x: 50, z: 235, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-s3", x: -30, z: 235, kind: "intersection", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-s4", x: -110, z: 225, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-s5", x: -185, z: 225, kind: "intersection", targetSpeed: 24, zone: "outer-highway" },

  { id: "car-outer-w1", x: -240, z: 165, kind: "highway", targetSpeed: 24, zone: "outer-highway" },
  { id: "car-outer-w2", x: -245, z: 85, kind: "intersection", targetSpeed: 24, zone: "outer-highway" },
  { id: "car-outer-w3", x: -240, z: 10, kind: "highway", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-w4", x: -230, z: -65, kind: "intersection", targetSpeed: 25, zone: "outer-highway" },
  { id: "car-outer-w5", x: -215, z: -130, kind: "highway", targetSpeed: 24, zone: "outer-highway" },

  // Дальние магистральные узлы (300..520м для машин из дальних секторов высадки)
  { id: "car-far-n", x: 0, z: -310, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-ne", x: 240, z: -240, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-e", x: 315, z: 0, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-se", x: 245, z: 245, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-s", x: 0, z: 315, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-sw", x: -255, z: 245, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-w", x: -315, z: 0, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
  { id: "car-far-nw", x: -245, z: -245, kind: "intersection", targetSpeed: 26, zone: "far-perimeter" },
]);

/**
 * Пехотные кубы для ботов и напарников (Ped Nodes):
 * - "doorway" — вход/выход перед дверью и сразу за порогом (чтобы боты и напарники четко входили в двери)
 * - "interior" — куб внутри комнаты или на втором этаже здания
 * - "stair" — куб у подножия или вершины лестницы
 * - "cover" — куб укрытия у угла здания, стены или магазина
 * - "flank" — куб обхода с фланга для окружения противника
 * - "roam" — опорный куб патрулирования и продвижения по карте
 */
export const MANUAL_PED_CUBES = Object.freeze([
  // =========================================================================
  // 1. ГЛАВНЫЙ СКЛАД (Warehouse: x: 45..75, z: -12..12, дверь на востоке x: 75, z: 0)
  // =========================================================================
  // Входная дверь и порог склада
  { id: "ped-warehouse-door-out", x: 77.4, y: 0, z: 0, kind: "doorway", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-door-in", x: 72.6, y: 0, z: 0, kind: "doorway", buildingId: "warehouse", zone: "warehouse" },
  // Внутри первого этажа и лестница на второй этаж
  { id: "ped-warehouse-hall-center", x: 61, y: 0, z: 0, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-hall-nw", x: 51, y: 0, z: -7, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-hall-sw", x: 51, y: 0, z: 7, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-hall-ne", x: 66, y: 0, z: -7, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-hall-se", x: 66, y: 0, z: 7, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-stair-bottom", x: 73.2, y: 0, z: 0, kind: "stair", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-stair-top", x: 66.8, y: 3.2, z: 0, kind: "stair", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-upper-north", x: 58, y: 3.2, z: -6.5, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-upper-south", x: 58, y: 3.2, z: 6.5, kind: "interior", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-upper-west", x: 50, y: 3.2, z: 0, kind: "interior", buildingId: "warehouse", zone: "warehouse" },

  // Внешние углы укрытий у стен склада
  { id: "ped-warehouse-corner-nw", x: 41.5, y: 0, z: -15.5, kind: "cover", buildingId: "warehouse", coverNormal: { x: -0.7, z: -0.7 }, zone: "warehouse" },
  { id: "ped-warehouse-corner-ne", x: 78.5, y: 0, z: -15.5, kind: "cover", buildingId: "warehouse", coverNormal: { x: 0.7, z: -0.7 }, zone: "warehouse" },
  { id: "ped-warehouse-corner-se", x: 78.5, y: 0, z: 15.5, kind: "cover", buildingId: "warehouse", coverNormal: { x: 0.7, z: 0.7 }, zone: "warehouse" },
  { id: "ped-warehouse-corner-sw", x: 41.5, y: 0, z: 15.5, kind: "cover", buildingId: "warehouse", coverNormal: { x: -0.7, z: 0.7 }, zone: "warehouse" },
  { id: "ped-warehouse-wall-north-w", x: 52, y: 0, z: -15.2, kind: "cover", buildingId: "warehouse", coverNormal: { x: 0, z: -1 }, zone: "warehouse" },
  { id: "ped-warehouse-wall-north-e", x: 68, y: 0, z: -15.2, kind: "cover", buildingId: "warehouse", coverNormal: { x: 0, z: -1 }, zone: "warehouse" },
  { id: "ped-warehouse-wall-south-w", x: 52, y: 0, z: 15.2, kind: "cover", buildingId: "warehouse", coverNormal: { x: 0, z: 1 }, zone: "warehouse" },
  { id: "ped-warehouse-wall-south-e", x: 68, y: 0, z: 15.2, kind: "cover", buildingId: "warehouse", coverNormal: { x: 0, z: 1 }, zone: "warehouse" },
  { id: "ped-warehouse-wall-west-n", x: 41.5, y: 0, z: -5, kind: "cover", buildingId: "warehouse", coverNormal: { x: -1, z: 0 }, zone: "warehouse" },
  { id: "ped-warehouse-wall-west-s", x: 41.5, y: 0, z: 5, kind: "cover", buildingId: "warehouse", coverNormal: { x: -1, z: 0 }, zone: "warehouse" },

  // Кубы у магазина склада (x: 82, z: 0) и фланги каменной площадки
  { id: "ped-shop-warehouse-north", x: 82, y: 0, z: -5.5, kind: "cover", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-shop-warehouse-south", x: 82, y: 0, z: 5.5, kind: "cover", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-shop-warehouse-east", x: 88, y: 0, z: 0, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-nw", x: 32, y: 0, z: -22, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-n", x: 60, y: 0, z: -24, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-ne", x: 88, y: 0, z: -22, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-se", x: 88, y: 0, z: 22, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-s", x: 60, y: 0, z: 24, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-sw", x: 32, y: 0, z: 22, kind: "flank", buildingId: "warehouse", zone: "warehouse" },
  { id: "ped-warehouse-flank-w", x: 30, y: 0, z: 0, kind: "flank", buildingId: "warehouse", zone: "warehouse" },

  // =========================================================================
  // 2. ЦЕНТРАЛЬНЫЙ МАГАЗИН И ЦЕНТРАЛЬНАЯ ПЛОЩАДЬ (x: 0, z: -26)
  // =========================================================================
  { id: "ped-shop-center-front", x: 0, y: 0, z: -21, kind: "cover", zone: "center-plaza" },
  { id: "ped-shop-center-back", x: 0, y: 0, z: -32, kind: "cover", zone: "center-plaza" },
  { id: "ped-shop-center-west", x: -6.5, y: 0, z: -26, kind: "cover", zone: "center-plaza" },
  { id: "ped-shop-center-east", x: 6.5, y: 0, z: -26, kind: "cover", zone: "center-plaza" },
  { id: "ped-center-flank-nw", x: -16, y: 0, z: -36, kind: "flank", zone: "center-plaza" },
  { id: "ped-center-flank-ne", x: 16, y: 0, z: -36, kind: "flank", zone: "center-plaza" },
  { id: "ped-center-flank-sw", x: -16, y: 0, z: -14, kind: "flank", zone: "center-plaza" },
  { id: "ped-center-flank-se", x: 16, y: 0, z: -14, kind: "flank", zone: "center-plaza" },
  { id: "ped-center-origin", x: 0, y: 0, z: 0, kind: "roam", zone: "center-plaza" },
  { id: "ped-center-west", x: -18, y: 0, z: 2, kind: "cover", zone: "center-plaza" },
  { id: "ped-center-east", x: 18, y: 0, z: 2, kind: "cover", zone: "center-plaza" },
  { id: "ped-center-south", x: 0, y: 0, z: 18, kind: "roam", zone: "center-plaza" },
  { id: "ped-center-south-w", x: -18, y: 0, z: 20, kind: "flank", zone: "center-plaza" },
  { id: "ped-center-south-e", x: 18, y: 0, z: 20, kind: "flank", zone: "center-plaza" },

  // =========================================================================
  // 3. ДОМИК ЛЕСНИКА (x: -116..-104, z: -80..-70) И МАГАЗИН (x: -96, z: -75)
  // =========================================================================
  { id: "ped-forest-hut-door-out", x: -101.6, y: 0, z: -75, kind: "doorway", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-door-in", x: -106.2, y: 0, z: -75, kind: "doorway", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-room-crate", x: -112.2, y: 0, z: -73.5, kind: "interior", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-corner-nw", x: -119.2, y: 0, z: -83.2, kind: "cover", buildingId: "forest-hut", coverNormal: { x: -0.7, z: -0.7 }, zone: "forest-hut" },
  { id: "ped-forest-hut-corner-ne", x: -100.8, y: 0, z: -83.2, kind: "cover", buildingId: "forest-hut", coverNormal: { x: 0.7, z: -0.7 }, zone: "forest-hut" },
  { id: "ped-forest-hut-corner-se", x: -100.8, y: 0, z: -66.8, kind: "cover", buildingId: "forest-hut", coverNormal: { x: 0.7, z: 0.7 }, zone: "forest-hut" },
  { id: "ped-forest-hut-corner-sw", x: -119.2, y: 0, z: -66.8, kind: "cover", buildingId: "forest-hut", coverNormal: { x: -0.7, z: 0.7 }, zone: "forest-hut" },
  { id: "ped-forest-hut-wall-west", x: -119.5, y: 0, z: -75, kind: "cover", buildingId: "forest-hut", coverNormal: { x: -1, z: 0 }, zone: "forest-hut" },
  { id: "ped-forest-hut-wall-north", x: -110, y: 0, z: -83.5, kind: "cover", buildingId: "forest-hut", coverNormal: { x: 0, z: -1 }, zone: "forest-hut" },
  { id: "ped-forest-hut-wall-south", x: -110, y: 0, z: -66.5, kind: "cover", buildingId: "forest-hut", coverNormal: { x: 0, z: 1 }, zone: "forest-hut" },
  // Магазин у домика лесника (x: -96, z: -75)
  { id: "ped-shop-forest-north", x: -96, y: 0, z: -80, kind: "cover", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-shop-forest-south", x: -96, y: 0, z: -70, kind: "cover", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-shop-forest-east", x: -90, y: 0, z: -75, kind: "flank", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-flank-nw", x: -128, y: 0, z: -88, kind: "flank", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-flank-ne", x: -88, y: 0, z: -88, kind: "flank", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-flank-se", x: -88, y: 0, z: -62, kind: "flank", buildingId: "forest-hut", zone: "forest-hut" },
  { id: "ped-forest-hut-flank-sw", x: -128, y: 0, z: -62, kind: "flank", buildingId: "forest-hut", zone: "forest-hut" },

  // =========================================================================
  // 4. ДОМ С ПРИПАСАМИ (x: -185..-165, z: 87..103), МАГАЗИН (x: -158, z: 95) И ПЕСЧАНАЯ НИЗИНА
  // =========================================================================
  // Восточная и западная двери дома с припасами
  { id: "ped-loot-house-east-door-out", x: -162.4, y: 0, z: 95, kind: "doorway", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-east-door-in", x: -167.4, y: 0, z: 95, kind: "doorway", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-mid-passage", x: -175, y: 0, z: 95, kind: "interior", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-east-room-n", x: -168.5, y: 0, z: 90.2, kind: "interior", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-east-room-s", x: -168.5, y: 0, z: 99.8, kind: "interior", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-west-room-n", x: -181.5, y: 0, z: 90.2, kind: "interior", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-west-room-s", x: -181.5, y: 0, z: 99.8, kind: "interior", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-west-door-in", x: -182.6, y: 0, z: 91.5, kind: "doorway", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-west-door-out", x: -187.6, y: 0, z: 91.5, kind: "doorway", buildingId: "loot-house", zone: "loot-house" },

  // Углы и внешние стены дома с припасами
  { id: "ped-loot-house-corner-nw", x: -188.4, y: 0, z: 83.6, kind: "cover", buildingId: "loot-house", coverNormal: { x: -0.7, z: -0.7 }, zone: "loot-house" },
  { id: "ped-loot-house-corner-ne", x: -161.6, y: 0, z: 83.6, kind: "cover", buildingId: "loot-house", coverNormal: { x: 0.7, z: -0.7 }, zone: "loot-house" },
  { id: "ped-loot-house-corner-se", x: -161.6, y: 0, z: 106.4, kind: "cover", buildingId: "loot-house", coverNormal: { x: 0.7, z: 0.7 }, zone: "loot-house" },
  { id: "ped-loot-house-corner-sw", x: -188.4, y: 0, z: 106.4, kind: "cover", buildingId: "loot-house", coverNormal: { x: -0.7, z: 0.7 }, zone: "loot-house" },
  { id: "ped-loot-house-wall-north", x: -175, y: 0, z: 83.5, kind: "cover", buildingId: "loot-house", coverNormal: { x: 0, z: -1 }, zone: "loot-house" },
  { id: "ped-loot-house-wall-south", x: -175, y: 0, z: 106.5, kind: "cover", buildingId: "loot-house", coverNormal: { x: 0, z: 1 }, zone: "loot-house" },

  // Магазин у дома с припасами (x: -158, z: 95) и фланги
  { id: "ped-shop-loot-north", x: -158, y: 0, z: 89.5, kind: "cover", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-shop-loot-south", x: -158, y: 0, z: 100.5, kind: "cover", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-shop-loot-east", x: -152, y: 0, z: 95, kind: "flank", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-flank-nw", x: -196, y: 0, z: 76, kind: "flank", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-flank-ne", x: -152, y: 0, z: 76, kind: "flank", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-flank-se", x: -152, y: 0, z: 114, kind: "flank", buildingId: "loot-house", zone: "loot-house" },
  { id: "ped-loot-house-flank-sw", x: -196, y: 0, z: 114, kind: "flank", buildingId: "loot-house", zone: "loot-house" },

  // Песчаная низина (x: -235..-145, z: 90..190)
  { id: "ped-sand-dune-1", x: -212, y: 0, z: 105, kind: "cover", zone: "sand-basin" },
  { id: "ped-sand-dune-2", x: -188, y: 0, z: 128, kind: "flank", zone: "sand-basin" },
  { id: "ped-sand-dune-3", x: -162, y: 0, z: 132, kind: "cover", zone: "sand-basin" },
  { id: "ped-sand-dune-4", x: -218, y: 0, z: 142, kind: "cover", zone: "sand-basin" },
  { id: "ped-sand-dune-5", x: -192, y: 0, z: 158, kind: "roam", zone: "sand-basin" },
  { id: "ped-sand-dune-6", x: -156, y: 0, z: 162, kind: "flank", zone: "sand-basin" },
  { id: "ped-sand-dune-7", x: -210, y: 0, z: 178, kind: "cover", zone: "sand-basin" },
  { id: "ped-sand-dune-8", x: -174, y: 0, z: 182, kind: "flank", zone: "sand-basin" },

  // =========================================================================
  // 5. ДВУХЭТАЖНЫЙ ДОМ (x: 126..144, z: 113..127) И МАГАЗИН (x: 118, z: 120)
  // =========================================================================
  // Западная входная дверь, первый этаж, лестница и второй этаж
  { id: "ped-two-storey-door-out", x: 123.5, y: 0, z: 120, kind: "doorway", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-door-in", x: 128.2, y: 0, z: 120, kind: "doorway", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-ground-ne", x: 140.2, y: 0, z: 115.6, kind: "interior", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-ground-se", x: 140.2, y: 0, z: 124.4, kind: "interior", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-stair-bottom", x: 128.6, y: 0, z: 120, kind: "stair", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-stair-top", x: 135.2, y: 3.2, z: 120, kind: "stair", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-upper-ne", x: 140.2, y: 3.2, z: 115.6, kind: "interior", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-upper-se", x: 140.2, y: 3.2, z: 124.4, kind: "interior", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-upper-nw", x: 134.2, y: 3.2, z: 115.4, kind: "interior", buildingId: "two-storey-house", zone: "two-storey-house" },

  // Внешние углы и стены двухэтажного дома
  { id: "ped-two-storey-corner-nw", x: 122.6, y: 0, z: 109.6, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: -0.7, z: -0.7 }, zone: "two-storey-house" },
  { id: "ped-two-storey-corner-ne", x: 147.4, y: 0, z: 109.6, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: 0.7, z: -0.7 }, zone: "two-storey-house" },
  { id: "ped-two-storey-corner-se", x: 147.4, y: 0, z: 130.4, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: 0.7, z: 0.7 }, zone: "two-storey-house" },
  { id: "ped-two-storey-corner-sw", x: 122.6, y: 0, z: 130.4, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: -0.7, z: 0.7 }, zone: "two-storey-house" },
  { id: "ped-two-storey-wall-north", x: 135, y: 0, z: 109.5, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: 0, z: -1 }, zone: "two-storey-house" },
  { id: "ped-two-storey-wall-east", x: 147.5, y: 0, z: 120, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: 1, z: 0 }, zone: "two-storey-house" },
  { id: "ped-two-storey-wall-south", x: 135, y: 0, z: 130.5, kind: "cover", buildingId: "two-storey-house", coverNormal: { x: 0, z: 1 }, zone: "two-storey-house" },

  // Магазин у двухэтажного дома (x: 118, z: 120) и фланги
  { id: "ped-shop-two-storey-north", x: 118, y: 0, z: 114.5, kind: "cover", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-shop-two-storey-south", x: 118, y: 0, z: 125.5, kind: "cover", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-shop-two-storey-west", x: 112, y: 0, z: 120, kind: "flank", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-flank-nw", x: 114, y: 0, z: 102, kind: "flank", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-flank-ne", x: 155, y: 0, z: 102, kind: "flank", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-flank-se", x: 155, y: 0, z: 138, kind: "flank", buildingId: "two-storey-house", zone: "two-storey-house" },
  { id: "ped-two-storey-flank-sw", x: 114, y: 0, z: 138, kind: "flank", buildingId: "two-storey-house", zone: "two-storey-house" },

  // =========================================================================
  // 6. ВОСТОЧНЫЙ СЕКТОР ЗА СКЛАДОМ (x: 105..175, z: -45..10)
  // =========================================================================
  { id: "ped-east-depot-nw", x: 118, y: 0, z: -38, kind: "cover", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-ne", x: 162, y: 0, z: -38, kind: "cover", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-se", x: 162, y: 0, z: -6, kind: "cover", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-sw", x: 118, y: 0, z: -6, kind: "cover", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-flank-n", x: 140, y: 0, z: -44, kind: "flank", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-flank-s", x: 140, y: 0, z: 2, kind: "flank", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-flank-e", x: 168, y: 0, z: -22, kind: "flank", buildingId: "warehouse-east", zone: "east-depot" },
  { id: "ped-east-depot-flank-w", x: 112, y: 0, z: -22, kind: "flank", buildingId: "warehouse-east", zone: "east-depot" },

  // =========================================================================
  // 7. СЕВЕРО-ЗАПАДНЫЙ ЛЕСНОЙ КОРИДОР (Между Центром и Домиком лесника)
  // =========================================================================
  { id: "ped-nw-forest-1", x: -35, y: 0, z: -35, kind: "cover", zone: "nw-forest" },
  { id: "ped-nw-forest-2", x: -52, y: 0, z: -48, kind: "roam", zone: "nw-forest" },
  { id: "ped-nw-forest-3", x: -68, y: 0, z: -60, kind: "cover", zone: "nw-forest" },
  { id: "ped-nw-forest-4", x: -84, y: 0, z: -64, kind: "flank", zone: "nw-forest" },
  { id: "ped-nw-forest-5", x: -62, y: 0, z: -80, kind: "flank", zone: "nw-forest" },
  { id: "ped-nw-forest-6", x: -82, y: 0, z: -92, kind: "cover", zone: "nw-forest" },
  { id: "ped-nw-forest-7", x: -45, y: 0, z: -62, kind: "roam", zone: "nw-forest" },
  { id: "ped-nw-forest-8", x: -72, y: 0, z: -42, kind: "flank", zone: "nw-forest" },
  { id: "ped-nw-forest-9", x: -138, y: 0, z: -105, kind: "cover", zone: "nw-forest" },
  { id: "ped-nw-forest-10", x: -108, y: 0, z: -112, kind: "flank", zone: "nw-forest" },

  // =========================================================================
  // 8. СЕВЕРНЫЙ ХРЕБЕТ И СЕВЕРО-ВОСТОЧНЫЙ ЛЕС (z: -50..-200)
  // =========================================================================
  { id: "ped-north-ridge-1", x: -20, y: 0, z: -62, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-2", x: 0, y: 0, z: -68, kind: "roam", zone: "north-ridge" },
  { id: "ped-north-ridge-3", x: 22, y: 0, z: -62, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-4", x: 42, y: 0, z: -52, kind: "flank", zone: "north-ridge" },
  { id: "ped-north-ridge-5", x: 68, y: 0, z: -56, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-6", x: 94, y: 0, z: -60, kind: "flank", zone: "north-ridge" },
  { id: "ped-north-ridge-7", x: -28, y: 0, z: -98, kind: "flank", zone: "north-ridge" },
  { id: "ped-north-ridge-8", x: 0, y: 0, z: -104, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-9", x: 32, y: 0, z: -98, kind: "flank", zone: "north-ridge" },
  { id: "ped-north-ridge-10", x: 64, y: 0, z: -96, kind: "roam", zone: "north-ridge" },
  { id: "ped-north-ridge-11", x: 96, y: 0, z: -94, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-12", x: 128, y: 0, z: -86, kind: "flank", zone: "north-ridge" },
  { id: "ped-north-ridge-13", x: -55, y: 0, z: -135, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-14", x: -18, y: 0, z: -145, kind: "roam", zone: "north-ridge" },
  { id: "ped-north-ridge-15", x: 24, y: 0, z: -145, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-16", x: 68, y: 0, z: -138, kind: "flank", zone: "north-ridge" },
  { id: "ped-north-ridge-17", x: 112, y: 0, z: -128, kind: "cover", zone: "north-ridge" },
  { id: "ped-north-ridge-18", x: 152, y: 0, z: -110, kind: "flank", zone: "north-ridge" },

  // =========================================================================
  // 9. ЮГО-ВОСТОЧНЫЙ КОРИДОР (Между Складом и Двухэтажным домом)
  // =========================================================================
  { id: "ped-se-corridor-1", x: 48, y: 0, z: 45, kind: "cover", zone: "se-corridor" },
  { id: "ped-se-corridor-2", x: 72, y: 0, z: 48, kind: "roam", zone: "se-corridor" },
  { id: "ped-se-corridor-3", x: 96, y: 0, z: 48, kind: "flank", zone: "se-corridor" },
  { id: "ped-se-corridor-4", x: 122, y: 0, z: 42, kind: "cover", zone: "se-corridor" },
  { id: "ped-se-corridor-5", x: 62, y: 0, z: 75, kind: "flank", zone: "se-corridor" },
  { id: "ped-se-corridor-6", x: 88, y: 0, z: 78, kind: "cover", zone: "se-corridor" },
  { id: "ped-se-corridor-7", x: 114, y: 0, z: 76, kind: "roam", zone: "se-corridor" },
  { id: "ped-se-corridor-8", x: 142, y: 0, z: 74, kind: "flank", zone: "se-corridor" },
  { id: "ped-se-corridor-9", x: 84, y: 0, z: 105, kind: "cover", zone: "se-corridor" },
  { id: "ped-se-corridor-10", x: 96, y: 0, z: 122, kind: "flank", zone: "se-corridor" },
  { id: "ped-se-corridor-11", x: 168, y: 0, z: 86, kind: "cover", zone: "se-corridor" },
  { id: "ped-se-corridor-12", x: 175, y: 0, z: 45, kind: "roam", zone: "se-corridor" },

  // =========================================================================
  // 10. ЮЖНАЯ ПОЛЯНА (Между Центром, Домом с припасами и Двухэтажным домом)
  // =========================================================================
  { id: "ped-south-glade-1", x: -24, y: 0, z: 46, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-2", x: 0, y: 0, z: 48, kind: "roam", zone: "south-glade" },
  { id: "ped-south-glade-3", x: 24, y: 0, z: 46, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-4", x: -36, y: 0, z: 78, kind: "flank", zone: "south-glade" },
  { id: "ped-south-glade-5", x: 0, y: 0, z: 82, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-6", x: 32, y: 0, z: 78, kind: "flank", zone: "south-glade" },
  { id: "ped-south-glade-7", x: -48, y: 0, z: 112, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-8", x: -12, y: 0, z: 116, kind: "roam", zone: "south-glade" },
  { id: "ped-south-glade-9", x: 24, y: 0, z: 116, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-10", x: 56, y: 0, z: 114, kind: "flank", zone: "south-glade" },
  { id: "ped-south-glade-11", x: -72, y: 0, z: 142, kind: "flank", zone: "south-glade" },
  { id: "ped-south-glade-12", x: -28, y: 0, z: 152, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-13", x: 18, y: 0, z: 154, kind: "roam", zone: "south-glade" },
  { id: "ped-south-glade-14", x: 62, y: 0, z: 152, kind: "cover", zone: "south-glade" },
  { id: "ped-south-glade-15", x: 96, y: 0, z: 156, kind: "flank", zone: "south-glade" },

  // =========================================================================
  // 11. ЗАПАДНЫЙ ЛЕС И ПЕРЕХОД К ДОМУ С ПРИПАСАМИ (x: -45..-190, z: -40..75)
  // =========================================================================
  { id: "ped-west-woods-1", x: -46, y: 0, z: -8, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-2", x: -48, y: 0, z: 18, kind: "flank", zone: "west-woods" },
  { id: "ped-west-woods-3", x: -74, y: 0, z: -18, kind: "roam", zone: "west-woods" },
  { id: "ped-west-woods-4", x: -76, y: 0, z: 12, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-5", x: -76, y: 0, z: 42, kind: "flank", zone: "west-woods" },
  { id: "ped-west-woods-6", x: -104, y: 0, z: -34, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-7", x: -108, y: 0, z: -4, kind: "roam", zone: "west-woods" },
  { id: "ped-west-woods-8", x: -108, y: 0, z: 28, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-9", x: -108, y: 0, z: 58, kind: "flank", zone: "west-woods" },
  { id: "ped-west-woods-10", x: -138, y: 0, z: -36, kind: "flank", zone: "west-woods" },
  { id: "ped-west-woods-11", x: -142, y: 0, z: -4, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-12", x: -142, y: 0, z: 28, kind: "roam", zone: "west-woods" },
  { id: "ped-west-woods-13", x: -140, y: 0, z: 58, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-14", x: -172, y: 0, z: -42, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-15", x: -176, y: 0, z: -8, kind: "flank", zone: "west-woods" },
  { id: "ped-west-woods-16", x: -176, y: 0, z: 26, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-17", x: -174, y: 0, z: 56, kind: "flank", zone: "west-woods" },
  { id: "ped-west-woods-18", x: -118, y: 0, z: 86, kind: "cover", zone: "west-woods" },
  { id: "ped-west-woods-19", x: -94, y: 0, z: 78, kind: "roam", zone: "west-woods" },
  { id: "ped-west-woods-20", x: -116, y: 0, z: 114, kind: "flank", zone: "west-woods" },

  // =========================================================================
  // 12. ВНЕШНИЙ ПОЯС СЕКТОРОВ КАРТЫ (РАДИУС 190..330М ВОКРУГ ВСЕЙ АРЕНЫ)
  // =========================================================================
  // Северный внешний пояс
  { id: "ped-outer-n1", x: -165, y: 0, z: -155, kind: "cover", zone: "outer-north" },
  { id: "ped-outer-n2", x: -125, y: 0, z: -178, kind: "flank", zone: "outer-north" },
  { id: "ped-outer-n3", x: -80, y: 0, z: -195, kind: "cover", zone: "outer-north" },
  { id: "ped-outer-n4", x: -30, y: 0, z: -205, kind: "roam", zone: "outer-north" },
  { id: "ped-outer-n5", x: 25, y: 0, z: -205, kind: "cover", zone: "outer-north" },
  { id: "ped-outer-n6", x: 75, y: 0, z: -195, kind: "flank", zone: "outer-north" },
  { id: "ped-outer-n7", x: 125, y: 0, z: -178, kind: "cover", zone: "outer-north" },
  { id: "ped-outer-n8", x: 168, y: 0, z: -152, kind: "flank", zone: "outer-north" },

  // Восточный внешний пояс
  { id: "ped-outer-e1", x: 195, y: 0, z: -115, kind: "cover", zone: "outer-east" },
  { id: "ped-outer-e2", x: 208, y: 0, z: -68, kind: "roam", zone: "outer-east" },
  { id: "ped-outer-e3", x: 215, y: 0, z: -20, kind: "cover", zone: "outer-east" },
  { id: "ped-outer-e4", x: 215, y: 0, z: 28, kind: "flank", zone: "outer-east" },
  { id: "ped-outer-e5", x: 205, y: 0, z: 78, kind: "cover", zone: "outer-east" },
  { id: "ped-outer-e6", x: 192, y: 0, z: 128, kind: "flank", zone: "outer-east" },
  { id: "ped-outer-e7", x: 175, y: 0, z: 172, kind: "cover", zone: "outer-east" },

  // Южный внешний пояс
  { id: "ped-outer-s1", x: 138, y: 0, z: 195, kind: "flank", zone: "outer-south" },
  { id: "ped-outer-s2", x: 92, y: 0, z: 208, kind: "cover", zone: "outer-south" },
  { id: "ped-outer-s3", x: 42, y: 0, z: 215, kind: "roam", zone: "outer-south" },
  { id: "ped-outer-s4", x: -12, y: 0, z: 215, kind: "cover", zone: "outer-south" },
  { id: "ped-outer-s5", x: -64, y: 0, z: 210, kind: "flank", zone: "outer-south" },
  { id: "ped-outer-s6", x: -116, y: 0, z: 202, kind: "cover", zone: "outer-south" },
  { id: "ped-outer-s7", x: -165, y: 0, z: 208, kind: "flank", zone: "outer-south" },

  // Западный внешний пояс
  { id: "ped-outer-w1", x: -222, y: 0, z: 162, kind: "cover", zone: "outer-west" },
  { id: "ped-outer-w2", x: -225, y: 0, z: 75, kind: "flank", zone: "outer-west" },
  { id: "ped-outer-w3", x: -218, y: 0, z: 25, kind: "cover", zone: "outer-west" },
  { id: "ped-outer-w4", x: -215, y: 0, z: -28, kind: "roam", zone: "outer-west" },
  { id: "ped-outer-w5", x: -208, y: 0, z: -78, kind: "cover", zone: "outer-west" },
  { id: "ped-outer-w6", x: -195, y: 0, z: -122, kind: "flank", zone: "outer-west" },

  // Дальний пояс (270..340м) для отрядов, десантировавшихся на краях карты
  { id: "ped-rim-n", x: 0, y: 0, z: -285, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-nne", x: 115, y: 0, z: -265, kind: "flank", zone: "far-rim" },
  { id: "ped-rim-ne", x: 210, y: 0, z: -210, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-ene", x: 265, y: 0, z: -115, kind: "roam", zone: "far-rim" },
  { id: "ped-rim-e", x: 285, y: 0, z: 0, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-ese", x: 265, y: 0, z: 115, kind: "flank", zone: "far-rim" },
  { id: "ped-rim-se", x: 210, y: 0, z: 210, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-sse", x: 115, y: 0, z: 265, kind: "roam", zone: "far-rim" },
  { id: "ped-rim-s", x: 0, y: 0, z: 285, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-ssw", x: -115, y: 0, z: 265, kind: "flank", zone: "far-rim" },
  { id: "ped-rim-sw", x: -225, y: 0, z: 225, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-wsw", x: -268, y: 0, z: 115, kind: "roam", zone: "far-rim" },
  { id: "ped-rim-w", x: -285, y: 0, z: 0, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-wnw", x: -265, y: 0, z: -115, kind: "flank", zone: "far-rim" },
  { id: "ped-rim-nw", x: -210, y: 0, z: -210, kind: "cover", zone: "far-rim" },
  { id: "ped-rim-nnw", x: -115, y: 0, z: -265, kind: "roam", zone: "far-rim" },
]);
