const paths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  screenCam: '<rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="7.5" cy="12" r="2.5"/><path d="M8 21h8M12 17v4"/>',
  webcam: '<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.5"/><path d="M8 21h8M12 17v4"/>',
  webcamOff: '<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="2.5"/><path d="M8 21h8M12 17v4M3 3l18 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrowLeft: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  bubble: '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="16" cy="14" r="3"/>',
};

const filled = {
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
};

export function icon(name) {
  if (filled[name]) return `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${filled[name]}</svg>`;
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function logoMark() {
  return '<svg class="logo-mark" viewBox="0 0 100 120" aria-hidden="true"><path d="M50,0 L100,26 L50,52 L0,26 z" fill="#3EC5B5"/><path d="M50,34 L100,60 L50,86 L0,60 z" fill="#2A96A8"/><path d="M50,68 L100,94 L50,120 L0,94 z" fill="#2E9BC4"/></svg>';
}
