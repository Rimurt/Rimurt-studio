'use strict';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const formats = { square: [900, 900], wide: [1280, 720], tall: [800, 1000] };
const roles = { main: 'Главный', background: 'Фоновый' };
const examples = {
  reading: ['title', 'Вечернее чтение'],
  team: ['title', 'Вместе решаем задачи'],
  budget: ['names', 'Кошелёк, монета, папка']
};
const palettes = catalog.palettes;
const parser = new DOMParser();
const objects = new Map(catalog.objects.map((object) => {
  const variants = Object.fromEntries(Object.entries(object.variants).map(([key, markup]) => [
    key, parser.parseFromString(markup, 'image/svg+xml').documentElement
  ]));
  const [, , width, height] = variants['L-main'].getAttribute('viewBox').split(' ').map(Number);
  return [object.id, { ...object, variants, width, height }];
}));

let format = 'square';
let detail = 'L';
let paletteIndex = 0;
let layers = [];
let selected = null;
let nextLayer = 0;
let drag = null;

const stage = $('stage');
const scene = $('scene');
const selection = $('selection');
stage.setAttribute('tabindex', '0');
stage.setAttribute('aria-description', 'Для выбранного объекта используйте стрелки, чтобы изменить положение.');

function svg(tag, attributes) {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function recolor(element, from, to, role) {
  const colors = role === 'background' ? ['background'] : ['background', 'object'];
  const mapping = new Map(colors.flatMap((key) => from[key].map((value, i) => [
    value.toUpperCase(), to[key][i]
  ])));
  if (role === 'main') mapping.set('WHITE', to.object[3]);
  for (const child of element.querySelectorAll('[fill], [stroke]')) {
    for (const attribute of ['fill', 'stroke']) {
      const replacement = mapping.get(child.getAttribute(attribute)?.toUpperCase());
      if (replacement) child.setAttribute(attribute, replacement);
    }
  }
}

function art(object, role) {
  const result = object.variants[detail + '-' + role].cloneNode(true);
  recolor(result, palettes[0], palettes[paletteIndex], role);
  result.setAttribute('width', object.width);
  result.setAttribute('height', object.height);
  return result;
}

function renderCatalog() {
  const buttons = [...objects.values()].map((object) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.object = object.id;
    const preview = art(object, 'main');
    preview.setAttribute('aria-hidden', 'true');
    button.append(preview, object.name);
    return button;
  });
  $('library').replaceChildren(...buttons);
  $('catalog-count').textContent = objects.size;
}

function renderPalettes() {
  const buttons = palettes.map((palette, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.palette = index;
    button.setAttribute('aria-pressed', String(paletteIndex === index));
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.setAttribute('aria-hidden', 'true');
    for (const color of [palette.background[0], palette.object[0], palette.object[1]]) {
      const chip = document.createElement('i');
      chip.style.backgroundColor = color;
      swatch.append(chip);
    }
    button.append(swatch, palette.name);
    return button;
  });
  $('palettes').replaceChildren(...buttons);
}

function transform(layer) {
  const { width, height } = objects.get(layer.object);
  return 'translate(' + layer.x + ' ' + layer.y + ') rotate(' + layer.angle +
    ') scale(' + layer.scale + ') translate(' + (-width / 2) + ' ' + (-height / 2) + ')';
}

function renderScene() {
  const [width, height] = formats[format];
  stage.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  stage.setAttribute('width', width);
  stage.setAttribute('height', height);
  stage.style.setProperty('--stage-width', Math.min(700, Math.round(510 * width / height)) + 'px');
  $('dimensions').textContent = width + ' × ' + height;

  const palette = palettes[paletteIndex];
  const background = parser.parseFromString(palette.art, 'image/svg+xml').documentElement;
  if (paletteIndex === 3) recolor(background, palettes[0], palette, 'background');
  background.setAttribute('width', width);
  background.setAttribute('height', height);
  background.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  background.setAttribute('aria-hidden', 'true');

  const groups = layers.map((layer) => {
    const object = objects.get(layer.object);
    const group = svg('g', { 'data-layer': layer.id, transform: transform(layer) });
    const title = svg('title', {});
    title.textContent = object.name;
    group.append(title, art(object, layer.role));
    return group;
  });
  scene.replaceChildren(background, ...groups);
  updateSelection();
}

function renderLayers() {
  $('layers').replaceChildren(...layers.slice().reverse().map((layer) => {
    const row = document.createElement('li');
    const button = document.createElement('button');
    const role = document.createElement('small');
    button.type = 'button';
    button.dataset.select = layer.id;
    role.textContent = roles[layer.role];
    button.append(objects.get(layer.object).name, role);
    row.append(button);
    return row;
  }));
  $('layer-count').textContent = layers.length;
  $('empty').hidden = layers.length > 0;
  updateSelection();
}

function selectedLayer() {
  return layers.find((layer) => layer.id === selected);
}

function drawSelection(layer) {
  selection.toggleAttribute('hidden', !layer);
  if (!layer) return;
  const { width, height } = objects.get(layer.object);
  selection.setAttribute('width', width);
  selection.setAttribute('height', height);
  selection.setAttribute('transform', transform(layer));
}

function updateSelection() {
  const layer = selectedLayer();
  $('layer-tools').hidden = !layer;
  for (const button of $('layers').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.select) === selected));
  }
  if (layer) {
    $('role').value = layer.role;
    $('angle').value = layer.angle;
    const index = layers.indexOf(layer);
    $('raise').disabled = index === layers.length - 1;
    $('lower').disabled = index === 0;
  }
  drawSelection(layer);
}

function render() {
  renderLayers();
  renderScene();
}

function createLayer(object, x, y, scale, role = 'main') {
  return { id: ++nextLayer, object, x, y, scale, angle: 0, role };
}

function arrange(ids, useBackground) {
  const [width, height] = formats[format];
  const mainCount = useBackground ? ids.length - 1 : ids.length;
  const columns = Math.min(mainCount, width > height ? 3 : 2);
  const rows = Math.ceil(mainCount / columns);
  const hasBackground = useBackground && mainCount > 0;
  const layoutWidth = width * (hasBackground ? .79 : .82);
  const cellWidth = layoutWidth / columns;
  const cellHeight = height * .72 / rows;
  const main = ids.slice(0, mainCount).map((id, index) => {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, mainCount - row * columns);
    const column = index % columns;
    const stagger = rowCount > 1 ? (column / (rowCount - 1) - .5) * cellHeight * .26 : 0;
    const x = width * (hasBackground ? .52 : .5) + (column - (rowCount - 1) / 2) * cellWidth;
    const y = height / 2 + (row - (rows - 1) / 2) * cellHeight + stagger;
    return { id, x, y };
  });

  const scale = Math.min(...main.map(({ id }) => {
    const object = objects.get(id);
    return Math.min(cellWidth * .95 / object.width, cellHeight * .83 / object.height);
  }), Math.min(width, height) * .67 / 1446);
  const back = hasBackground ? [createLayer(ids.at(-1), width * .25, height * .28, scale, 'background')] : [];
  return [...back, ...main.map(({ id, x, y }) => createLayer(id, x, y, scale))];
}

const normalize = (value) => value.toLowerCase().replaceAll('ё', 'е').trim();

function findObjects(input, mode) {
  if (mode === 'names') {
    const names = input.split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean);
    const ids = names.map((name) => [...objects.values()].find((object) =>
      object.aliases.some((alias) => normalize(alias) === normalize(name)))?.id);
    const unknown = names.filter((_, index) => !ids[index]);
    return unknown.length
      ? { message: 'Не нашли: ' + unknown.join(', ') + '. Проверьте названия в библиотеке.' }
      : { ids };
  }

  const words = normalize(input).match(/[\p{L}\p{N}]+/gu) ?? [];
  const scores = [...objects.values()].map((object) => ({
    id: object.id,
    score: words.reduce((score, word) => {
      if (object.aliases.some((alias) => word === normalize(alias))) return score + 4;
      return score + Number(object.tags.some((tag) => word.startsWith(tag)));
    }, 0)
  }));
  return { ids: scores.filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score).slice(0, 3).map(({ id }) => id) };
}

function compose(input, mode) {
  const { ids, message } = findObjects(input, mode);
  if (!ids?.length) {
    $('message').textContent = message || 'Не нашли подходящих объектов. Попробуйте другой заголовок или укажите названия.';
    return;
  }
  $('message').textContent = '';
  layers = arrange(ids, mode === 'title' && ids.length === 3);
  selected = null;
  render();
}

function download(contents, type, name) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportScene() {
  const [width, height] = formats[format];
  const result = svg('svg', { width, height, viewBox: '0 0 ' + width + ' ' + height });
  for (const child of scene.children) result.append(child.cloneNode(true));
  const file = new XMLSerializer().serializeToString(result);
  download(file, 'image/svg+xml;charset=utf-8', 'sborka-' + format + '-' + detail.toLowerCase() + '.svg');
}

function changePalette(index) {
  paletteIndex = index;
  renderPalettes();
  $('palettes').querySelector('[aria-pressed=true]').focus();
  renderCatalog();
  renderScene();
}

$('compose').addEventListener('submit', (event) => {
  event.preventDefault();
  compose($('prompt').value, $('mode').value);
});
$('mode').addEventListener('change', () => {
  $('message').textContent = '';
  $('prompt').placeholder = $('mode').value === 'title'
    ? 'Например, вечернее чтение' : 'Например, книга, лампа, ручка';
});
$('examples').addEventListener('click', (event) => {
  const example = examples[event.target.dataset.example];
  if (!example) return;
  [$('mode').value, $('prompt').value] = example;
  $('mode').dispatchEvent(new Event('change'));
  $('compose').requestSubmit();
});
$('library').addEventListener('click', (event) => {
  const id = event.target.closest('[data-object]')?.dataset.object;
  if (!id) return;
  const [width, height] = formats[format];
  const offset = (layers.length % 4) * 24;
  const scale = layers[0]?.scale ?? Math.min(width, height) * .47 / 1446;
  const layer = createLayer(id, width / 2 + offset, height / 2 + offset, scale);
  layers.push(layer);
  selected = layer.id;
  render();
});
$('format').addEventListener('change', () => {
  const [oldWidth, oldHeight] = formats[format];
  format = $('format').value;
  const [width, height] = formats[format];
  const ratio = Math.min(width, height) / Math.min(oldWidth, oldHeight);
  for (const layer of layers) {
    layer.x *= width / oldWidth;
    layer.y *= height / oldHeight;
    layer.scale *= ratio;
  }
  renderScene();
});
$('detail').addEventListener('change', () => {
  detail = $('detail').value;
  renderCatalog();
  renderScene();
});
$('palettes').addEventListener('click', (event) => {
  const index = event.target.closest('[data-palette]')?.dataset.palette;
  if (index !== undefined) changePalette(Number(index));
});
$('palette-template').addEventListener('click', () => {
  const { background, object } = palettes[paletteIndex];
  download(JSON.stringify({ background, object }, null, 2), 'application/json', 'palette.json');
});
$('palette-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const valid = (value) => Array.isArray(value) && value.length === 4 &&
      value.every((color) => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color));
    if (!data || !valid(data.background) || !valid(data.object)) throw new Error('Invalid palette');
    palettes[3] = { name: 'Своя', art: palettes[0].art, background: data.background, object: data.object };
    $('palette-error').textContent = '';
    changePalette(3);
  } catch {
    $('palette-error').textContent = 'Нужен JSON с полями background и object. В каждом должно быть четыре цвета вида #AABBCC.';
  } finally {
    event.target.value = '';
  }
});
$('layers').addEventListener('click', (event) => {
  const id = event.target.closest('[data-select]')?.dataset.select;
  if (id === undefined) return;
  selected = Number(id);
  updateSelection();
});
$('role').addEventListener('change', () => {
  selectedLayer().role = $('role').value;
  render();
});
$('angle').addEventListener('change', () => {
  const layer = selectedLayer();
  const angle = $('angle').valueAsNumber;
  if (Number.isFinite(angle)) layer.angle = angle % 360;
  renderScene();
});
$('duplicate').addEventListener('click', () => {
  const original = selectedLayer();
  const [width, height] = formats[format];
  const x = Math.min(width, original.x + 24);
  const y = Math.min(height, original.y + 24);
  const copy = { ...original, id: ++nextLayer, x, y };
  layers.splice(layers.indexOf(original) + 1, 0, copy);
  selected = copy.id;
  render();
});
$('remove').addEventListener('click', () => {
  const index = layers.indexOf(selectedLayer());
  layers.splice(index, 1);
  selected = (layers[index] ?? layers[index - 1])?.id ?? null;
  render();
  ($('layers').querySelector('[aria-pressed=true]') ?? $('library').firstElementChild).focus();
});

function moveLayer(delta) {
  const index = layers.indexOf(selectedLayer());
  const target = index + delta;
  if (target < 0 || target >= layers.length) return;
  [layers[index], layers[target]] = [layers[target], layers[index]];
  render();
  if (document.activeElement === document.body) $('layers').querySelector('[aria-pressed=true]').focus();
}

$('raise').addEventListener('click', () => moveLayer(1));
$('lower').addEventListener('click', () => moveLayer(-1));

function canvasPoint(event) {
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(stage.getScreenCTM().inverse());
}

function positionLayer(layer, x, y) {
  const [width, height] = formats[format];
  layer.x = Math.max(0, Math.min(width, x));
  layer.y = Math.max(0, Math.min(height, y));
  scene.querySelector('[data-layer="' + layer.id + '"]').setAttribute('transform', transform(layer));
  drawSelection(layer);
}

stage.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  const group = event.target.closest('[data-layer]');
  selected = group ? Number(group.dataset.layer) : null;
  updateSelection();
  const layer = selectedLayer();
  if (!layer) return;
  stage.focus({ preventScroll: true });
  stage.setPointerCapture(event.pointerId);
  stage.classList.add('dragging');
  const point = canvasPoint(event);
  drag = { id: event.pointerId, layer, offsetX: point.x - layer.x, offsetY: point.y - layer.y };
});
stage.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return;
  const point = canvasPoint(event);
  positionLayer(drag.layer, point.x - drag.offsetX, point.y - drag.offsetY);
});
stage.addEventListener('lostpointercapture', () => {
  drag = null;
  stage.classList.remove('dragging');
});
stage.addEventListener('keydown', (event) => {
  const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const layer = selectedLayer();
  const delta = deltas[event.key];
  if (!layer || !delta) return;
  event.preventDefault();
  const step = event.shiftKey ? 15 : 3;
  positionLayer(layer, layer.x + delta[0] * step, layer.y + delta[1] * step);
});
$('export').addEventListener('click', exportScene);

renderCatalog();
renderPalettes();
compose(examples.reading[1], examples.reading[0]);
