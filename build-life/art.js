// Build Life — SVG art. Draws furniture, people, pets and the house. No game logic here.
import { ITEM, PET, WALLPAPERS, FLOORS, houseType, houseWidth } from './engine.js?v=dev';

export const U = 120, RH = 124;         // room unit width and height
export const FW = 60, FH = 66;          // floor slot box
export const WW = 92, WH = 48;          // wall item box
export const GW = 96, GH = 96;          // garden item box

const WOOD = '#8b5e3c', WOOD2 = '#5a3b25', LIGHTWOOD = '#c9a26f', LINEN = '#ece6da', STEEL = '#c3c7cb', BLACK = '#26262a', FABRIC = '#55657a', FABRIC2 = '#7d8c9c', BRASS = '#c7a24a';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const shadow = (w, h = 64) => `<ellipse cx="${w / 2}" cy="${h - 1}" rx="${w / 2 - 4}" ry="3" fill="rgba(0,0,0,.18)"/>`;

export const DEFS = `
<defs>
  <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a0714a"/><stop offset="1" stop-color="#6e4a2e"/></linearGradient>
  <linearGradient id="gSteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9dcdf"/><stop offset=".5" stop-color="#b3b8bd"/><stop offset="1" stop-color="#d3d6d9"/></linearGradient>
  <linearGradient id="gFabric" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a7a8e"/><stop offset="1" stop-color="#4b5a6d"/></linearGradient>
  <linearGradient id="gLinen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f0e8"/><stop offset="1" stop-color="#dcd5c7"/></linearGradient>
  <linearGradient id="gScreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3340"/><stop offset="1" stop-color="#0f141b"/></linearGradient>
  <linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc3d8"/><stop offset="1" stop-color="#3f7f9c"/></linearGradient>
  <linearGradient id="gSkyDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb2e5"/><stop offset="1" stop-color="#d8e9f7"/></linearGradient>
  <linearGradient id="gSkyEve" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5a8c"/><stop offset=".6" stop-color="#d98a5c"/><stop offset="1" stop-color="#f3c9a0"/></linearGradient>
  <linearGradient id="gSkyNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1026"/><stop offset="1" stop-color="#2a3350"/></linearGradient>
  <linearGradient id="gGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa35a"/><stop offset="1" stop-color="#4f7a3b"/></linearGradient>
  <radialGradient id="gGlow"><stop offset="0" stop-color="#ffd88a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd88a" stop-opacity="0"/></radialGradient>
  <radialGradient id="gFire"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ff9a2e"/><stop offset="1" stop-color="#c8401a" stop-opacity=".2"/></radialGradient>
  <pattern id="pStripe" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="7" height="14" fill="rgba(0,0,0,.06)"/></pattern>
  <pattern id="pStars" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="5" cy="6" r="1.3" fill="#ffe9a8"/><circle cx="17" cy="15" r="1" fill="#ffe9a8"/><circle cx="11" cy="20" r=".8" fill="#fff"/></pattern>
  <pattern id="pFloral" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="3" fill="#c98a8a" opacity=".7"/><circle cx="20" cy="19" r="2.4" fill="#8aa07a" opacity=".7"/><circle cx="8" cy="8" r="1" fill="#f1dd9a"/></pattern>
  <pattern id="pBrick" width="30" height="16" patternUnits="userSpaceOnUse"><rect width="30" height="16" fill="#a8655a"/><rect x="0" y="0" width="14" height="7" fill="#b4746a"/><rect x="15" y="0" width="14" height="7" fill="#9e5d52"/><rect x="0" y="8" width="7" height="7" fill="#9e5d52"/><rect x="8" y="8" width="14" height="7" fill="#b4746a"/><rect x="23" y="8" width="7" height="7" fill="#a8655a"/></pattern>
  <pattern id="pTiles" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="rgba(255,255,255,.1)"/><path d="M0 0H20V20" fill="none" stroke="rgba(0,0,0,.09)"/></pattern>
  <pattern id="pStone" width="40" height="22" patternUnits="userSpaceOnUse"><rect width="40" height="22" fill="#9a978f"/><rect x="1" y="1" width="18" height="9" rx="2" fill="#a6a39a"/><rect x="21" y="1" width="18" height="9" rx="2" fill="#8f8c84"/><rect x="11" y="12" width="18" height="9" rx="2" fill="#a19e95"/><rect x="31" y="12" width="9" height="9" rx="2" fill="#8f8c84"/><rect x="0" y="12" width="9" height="9" rx="2" fill="#a6a39a"/></pattern>
  <pattern id="pBoards" width="60" height="10" patternUnits="userSpaceOnUse"><rect width="60" height="10" fill="rgba(0,0,0,.05)"/><path d="M0 9.5H60M30 0V10" stroke="rgba(0,0,0,.18)" stroke-width="1"/></pattern>
  <pattern id="pChequer" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="rgba(0,0,0,.25)"/><rect x="10" y="10" width="10" height="10" fill="rgba(0,0,0,.25)"/></pattern>
  <pattern id="pRug" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#8a3b3b"/><circle cx="5" cy="5" r="2" fill="#c9a24a"/></pattern>
  <pattern id="pSlots" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="rgba(0,0,0,.12)"/></pattern>
</defs>`;

const PAT = { stripe: 'url(#pStripe)', stars: 'url(#pStars)', floral: 'url(#pFloral)', brick: 'url(#pBrick)', tiles: 'url(#pTiles)', stone: 'url(#pStone)', boards: 'url(#pBoards)', chequer: 'url(#pChequer)' };

// ───────────────────────── floor items (box FW*size × FH) ─────────────────────────
const F = {
  bed: () => `${shadow(60)}<rect x="6" y="12" width="48" height="24" rx="3" fill="url(#gWood)"/><rect x="4" y="32" width="52" height="20" rx="3" fill="url(#gLinen)"/><rect x="4" y="38" width="52" height="16" rx="3" fill="${FABRIC2}"/><rect x="9" y="33" width="18" height="8" rx="3" fill="#fff"/><rect x="7" y="54" width="4" height="8" fill="${WOOD2}"/><rect x="49" y="54" width="4" height="8" fill="${WOOD2}"/>`,
  doublebed: () => `${shadow(120)}<rect x="8" y="10" width="104" height="26" rx="4" fill="url(#gWood)"/><rect x="4" y="32" width="112" height="20" rx="3" fill="url(#gLinen)"/><rect x="4" y="39" width="112" height="15" rx="3" fill="#8a6b6b"/><rect x="12" y="33" width="36" height="8" rx="3" fill="#fff"/><rect x="72" y="33" width="36" height="8" rx="3" fill="#fff"/><rect x="8" y="54" width="5" height="8" fill="${WOOD2}"/><rect x="107" y="54" width="5" height="8" fill="${WOOD2}"/>`,
  bunkbed: () => `${shadow(60)}<rect x="6" y="2" width="4" height="60" fill="url(#gWood)"/><rect x="50" y="2" width="4" height="60" fill="url(#gWood)"/><rect x="6" y="20" width="48" height="12" rx="2" fill="url(#gLinen)"/><rect x="6" y="26" width="48" height="6" fill="#6b8a6b"/><rect x="6" y="46" width="48" height="12" rx="2" fill="url(#gLinen)"/><rect x="6" y="52" width="48" height="6" fill="#8a6b8a"/><rect x="9" y="21" width="12" height="5" rx="2" fill="#fff"/><rect x="9" y="47" width="12" height="5" rx="2" fill="#fff"/><path d="M42 20V62M47 20V62M42 25H47M42 33H47M42 41H47M42 49H47M42 57H47" stroke="${LIGHTWOOD}" stroke-width="2"/>`,
  cot: () => `${shadow(60)}<rect x="8" y="24" width="44" height="30" rx="2" fill="#f3f0ea"/><rect x="8" y="42" width="44" height="12" rx="2" fill="#dbe7f3"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${10 + i * 6.5}" y="18" width="2.4" height="28" fill="#e2dcd2"/>`).join('')}<rect x="6" y="16" width="48" height="3" rx="1.5" fill="#e8e2d8"/><rect x="6" y="46" width="48" height="3" rx="1.5" fill="#e8e2d8"/><rect x="9" y="54" width="4" height="8" fill="#d5cfc4"/><rect x="47" y="54" width="4" height="8" fill="#d5cfc4"/><path d="M30 4V16" stroke="#aaa" stroke-width="1.5"/><path d="M18 8H42" stroke="#aaa" stroke-width="1.5"/><circle cx="18" cy="12" r="3" fill="#e8a0a0"/><circle cx="30" cy="13" r="3" fill="#a0c0e8"/><circle cx="42" cy="12" r="3" fill="#f0d080"/>`,
  wardrobe: () => `${shadow(60)}<rect x="9" y="3" width="42" height="59" rx="2" fill="url(#gWood)"/><rect x="11" y="5" width="18" height="48" rx="1" fill="${WOOD}" stroke="${WOOD2}" stroke-width=".8"/><rect x="31" y="5" width="18" height="48" rx="1" fill="${WOOD}" stroke="${WOOD2}" stroke-width=".8"/><circle cx="27" cy="30" r="1.6" fill="${BRASS}"/><circle cx="33" cy="30" r="1.6" fill="${BRASS}"/><rect x="11" y="55" width="38" height="5" fill="${WOOD2}"/>`,
  desk: () => `${shadow(60)}<rect x="22" y="36" width="16" height="4" fill="${BLACK}"/><rect x="21" y="40" width="4" height="22" fill="${BLACK}"/><rect x="35" y="40" width="4" height="22" fill="${BLACK}"/><rect x="2" y="28" width="56" height="5" rx="1" fill="url(#gWood)"/><rect x="4" y="33" width="4" height="29" fill="${WOOD2}"/><rect x="52" y="33" width="4" height="29" fill="${WOOD2}"/><rect x="40" y="33" width="14" height="20" fill="${WOOD}"/><circle cx="47" cy="40" r="1.2" fill="${BRASS}"/><circle cx="47" cy="48" r="1.2" fill="${BRASS}"/><rect x="8" y="14" width="18" height="12" rx="1" fill="#fff" stroke="#999"/><path d="M11 18H23M11 21H20" stroke="#aaa"/><rect x="30" y="12" width="12" height="16" rx="2" fill="#8da0b5"/>`,
  sofa: () => `${shadow(120)}<rect x="8" y="16" width="104" height="22" rx="6" fill="url(#gFabric)"/><rect x="4" y="30" width="112" height="22" rx="5" fill="url(#gFabric)"/><rect x="4" y="30" width="12" height="24" rx="5" fill="#5f7084"/><rect x="104" y="30" width="12" height="24" rx="5" fill="#5f7084"/><rect x="18" y="33" width="40" height="16" rx="4" fill="#6f8196"/><rect x="62" y="33" width="40" height="16" rx="4" fill="#6f8196"/><rect x="34" y="20" width="18" height="12" rx="3" fill="#b89a6a"/><rect x="10" y="54" width="5" height="8" fill="${WOOD2}"/><rect x="105" y="54" width="5" height="8" fill="${WOOD2}"/>`,
  armchair: () => `${shadow(60)}<rect x="8" y="14" width="44" height="24" rx="6" fill="#6b5a4a"/><rect x="4" y="30" width="52" height="22" rx="5" fill="#7a6856"/><rect x="4" y="30" width="10" height="24" rx="5" fill="#5f4f41"/><rect x="46" y="30" width="10" height="24" rx="5" fill="#5f4f41"/><rect x="15" y="33" width="30" height="15" rx="4" fill="#8a7664"/><rect x="8" y="54" width="5" height="8" fill="${WOOD2}"/><rect x="47" y="54" width="5" height="8" fill="${WOOD2}"/>`,
  coffeetable: () => `${shadow(60)}<rect x="4" y="38" width="52" height="4" rx="1" fill="url(#gWood)"/><rect x="8" y="42" width="3" height="20" fill="${WOOD2}"/><rect x="49" y="42" width="3" height="20" fill="${WOOD2}"/><rect x="16" y="32" width="14" height="6" rx="1" fill="#6b8f9a"/><rect x="36" y="30" width="7" height="8" rx="1.5" fill="#fff" stroke="#999"/>`,
  bookcase: () => `${shadow(60)}<rect x="8" y="2" width="44" height="60" fill="url(#gWood)"/>${[0, 1, 2].map(r => `<rect x="11" y="${6 + r * 18}" width="38" height="14" fill="#3f2a1c"/>` + [0, 1, 2, 3, 4, 5].map(b => `<rect x="${12.5 + b * 6.2}" y="${8 + r * 18 + (b % 3)}" width="5" height="${12 - (b % 3)}" fill="${['#8a3b3b', '#3b5a8a', '#4f7a3b', '#c9a24a', '#6a3d9a', '#b8623b'][(b + r) % 6]}"/>`).join('')).join('')}`,
  lamp: () => `${shadow(60)}<path d="M18 8H42L48 28H12Z" fill="#e8dcc0" stroke="#c8b890"/><rect x="29" y="28" width="2.5" height="30" fill="${BRASS}"/><ellipse cx="30" cy="59" rx="12" ry="3" fill="${BRASS}"/>`,
  plant: () => `${shadow(60)}<path d="M18 40H42L39 62H21Z" fill="#b5664a"/><rect x="16" y="38" width="28" height="5" rx="1" fill="#c9765a"/><ellipse cx="30" cy="20" rx="7" ry="18" fill="#4f7a3b" transform="rotate(-20 30 30)"/><ellipse cx="30" cy="20" rx="7" ry="18" fill="#5b8a45" transform="rotate(20 30 30)"/><ellipse cx="30" cy="18" rx="6" ry="20" fill="#6a9a50"/>`,
  rug: () => `<rect x="4" y="50" width="112" height="12" rx="2" fill="url(#pRug)"/><rect x="4" y="50" width="112" height="12" rx="2" fill="none" stroke="#5a2222" stroke-width="2"/>`,
  piano: () => `${shadow(120)}<rect x="6" y="6" width="90" height="56" rx="2" fill="#1c1b1f"/><rect x="6" y="36" width="90" height="6" fill="#2d2c31"/><rect x="8" y="42" width="86" height="8" fill="#f4f1ea"/>${[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map(i => `<rect x="${12 + i * 6.3}" y="42" width="3.5" height="5" fill="#111"/>`).join('')}<rect x="10" y="12" width="82" height="18" fill="#2a292e"/><path d="M20 20H80" stroke="#c7a24a" stroke-width="1"/><rect x="98" y="40" width="18" height="6" rx="1" fill="url(#gWood)"/><rect x="100" y="46" width="3" height="16" fill="${WOOD2}"/><rect x="111" y="46" width="3" height="16" fill="${WOOD2}"/>`,
  fireplace: () => `${shadow(60)}<rect x="4" y="8" width="52" height="54" fill="url(#pBrick)"/><rect x="2" y="6" width="56" height="5" fill="#d9d2c4"/><rect x="14" y="20" width="32" height="40" fill="#1c1413"/><circle cx="30" cy="48" r="13" fill="url(#gFire)"/><path d="M24 54C22 44 28 44 27 36C32 42 36 40 36 48C38 44 40 50 36 54Z" fill="#ffb347"/><path d="M27 54C26 48 30 47 30 42C33 46 34 46 33 54Z" fill="#fff0a0"/><rect x="12" y="54" width="36" height="4" fill="#5a4a42"/>`,
  fridge: () => `${shadow(60)}<rect x="12" y="2" width="36" height="60" rx="3" fill="url(#gSteel)"/><path d="M12 24H48" stroke="#8c9196" stroke-width="1.5"/><rect x="41" y="8" width="2.5" height="12" rx="1" fill="#6e7378"/><rect x="41" y="30" width="2.5" height="18" rx="1" fill="#6e7378"/>`,
  cooker: () => `${shadow(60)}<rect x="6" y="18" width="48" height="44" rx="2" fill="url(#gSteel)"/><rect x="6" y="18" width="48" height="6" fill="#2a2a2e"/>${[16, 30, 44].map(x => `<circle cx="${x}" cy="21" r="2.4" fill="#444" stroke="#999" stroke-width=".8"/>`).join('')}<rect x="10" y="30" width="40" height="22" rx="2" fill="#2a2a2e"/><rect x="13" y="33" width="34" height="16" rx="1" fill="#3a3a40"/><rect x="10" y="26" width="40" height="2" fill="#777"/><rect x="6" y="6" width="48" height="10" fill="#444"/>${[14, 26, 38, 50].map(x => `<circle cx="${x - 4}" cy="11" r="4" fill="#2a2a2e" stroke="#666"/>`).join('')}`,
  sink: () => `${shadow(60)}<rect x="4" y="30" width="52" height="32" rx="2" fill="#e9e4da"/><rect x="4" y="30" width="52" height="4" fill="#bbb"/><path d="M30 34V62" stroke="#ccc"/><rect x="10" y="24" width="40" height="8" rx="2" fill="url(#gSteel)"/><rect x="14" y="26" width="32" height="5" fill="#9aa0a5"/><path d="M30 24V12Q30 8 36 8Q42 8 42 14" fill="none" stroke="#9aa0a5" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="46" r="1.4" fill="${BRASS}"/><circle cx="40" cy="46" r="1.4" fill="${BRASS}"/>`,
  diningtable: () => `${shadow(120)}<rect x="26" y="30" width="68" height="5" rx="1" fill="url(#gWood)"/><rect x="30" y="35" width="4" height="27" fill="${WOOD2}"/><rect x="86" y="35" width="4" height="27" fill="${WOOD2}"/><rect x="48" y="24" width="24" height="6" rx="1" fill="#fff"/><circle cx="60" cy="27" r="6" fill="#d9775a"/>${[8, 100].map(x => `<rect x="${x}" y="18" width="4" height="44" fill="${WOOD2}"/><rect x="${x}" y="38" width="14" height="4" fill="url(#gWood)"/><rect x="${x + 10}" y="42" width="3" height="20" fill="${WOOD2}"/>`).join('')}`,
  bath: () => `${shadow(120)}<path d="M8 30H112V50Q112 60 100 60H20Q8 60 8 50Z" fill="#f3f1ec" stroke="#cfcabf"/><path d="M14 34H106V48Q106 54 100 54H20Q14 54 14 48Z" fill="url(#gWater)"/><rect x="84" y="20" width="4" height="12" fill="#9aa0a5"/><path d="M86 20Q86 12 92 12Q98 12 98 18" fill="none" stroke="#9aa0a5" stroke-width="3"/><circle cx="80" cy="25" r="2" fill="#9aa0a5"/><circle cx="92" cy="25" r="2" fill="#9aa0a5"/><ellipse cx="40" cy="40" rx="5" ry="2.5" fill="#fff" opacity=".8"/><ellipse cx="60" cy="43" rx="6" ry="3" fill="#fff" opacity=".7"/>`,
  toilet: () => `${shadow(60)}<rect x="14" y="14" width="28" height="22" rx="3" fill="#f3f1ec" stroke="#cfcabf"/><rect x="18" y="12" width="20" height="3" rx="1" fill="#ddd"/><path d="M12 36H48Q48 50 36 52H24Q12 50 12 36Z" fill="#f3f1ec" stroke="#cfcabf"/><ellipse cx="30" cy="38" rx="16" ry="5" fill="#e3e0d8"/><rect x="24" y="52" width="12" height="10" fill="#eceae4"/><circle cx="36" cy="18" r="1.5" fill="#999"/>`,
  basin: () => `${shadow(60)}<path d="M10 30H50Q50 44 40 46H20Q10 44 10 30Z" fill="#f3f1ec" stroke="#cfcabf"/><ellipse cx="30" cy="32" rx="16" ry="4" fill="#e3e0d8"/><rect x="24" y="46" width="12" height="16" fill="#eceae4"/><path d="M30 28V20Q30 16 34 16Q38 16 38 20" fill="none" stroke="#9aa0a5" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="24" r="2" fill="#9aa0a5"/><circle cx="38" cy="24" r="2" fill="#9aa0a5"/>`,
  computer: () => `${shadow(60)}<rect x="2" y="34" width="56" height="4" rx="1" fill="url(#gWood)"/><rect x="4" y="38" width="4" height="24" fill="${WOOD2}"/><rect x="52" y="38" width="4" height="24" fill="${WOOD2}"/><rect x="12" y="8" width="34" height="22" rx="2" fill="#2a2a2e"/><rect x="14" y="10" width="30" height="18" fill="url(#gScreen)"/><rect x="16" y="12" width="12" height="2" fill="#5ad0a0"/><rect x="16" y="16" width="20" height="2" fill="#8fb8e8"/><rect x="16" y="20" width="16" height="2" fill="#e8c88f"/><rect x="26" y="30" width="6" height="4" fill="#444"/><rect x="18" y="31" width="22" height="3" rx="1" fill="#ddd"/><rect x="42" y="38" width="12" height="20" rx="1" fill="#3a3a40"/><circle cx="48" cy="42" r="1.2" fill="#5ad0a0"/>`,
  console: () => `${shadow(60)}<rect x="6" y="40" width="48" height="22" rx="2" fill="url(#gWood)"/><rect x="8" y="42" width="44" height="18" fill="#3b2a1e"/><rect x="14" y="32" width="32" height="8" rx="2" fill="#1e1e22"/><circle cx="42" cy="36" r="1.3" fill="#5ad0ff"/><path d="M18 24Q18 18 24 18H36Q42 18 42 24V28Q42 32 36 30H24Q18 32 18 28Z" fill="#2e2e33"/><circle cx="24" cy="24" r="2" fill="#666"/><circle cx="36" cy="23" r="1.5" fill="#d94a4a"/><circle cx="38" cy="26" r="1.5" fill="#4a9ad9"/>`,
  nettrap: () => `<ellipse cx="30" cy="58" rx="24" ry="5" fill="#8a7a4a" opacity=".9"/><path d="M8 58Q14 50 22 56Q30 48 38 56Q46 50 52 58" fill="none" stroke="#5a4a2a" stroke-width="2"/><path d="M12 56L48 60M14 60L46 54M18 52L42 62M22 62L40 50" stroke="#5a4a2a" stroke-width="1"/><path d="M8 58Q30 44 52 58" fill="none" stroke="#5a4a2a" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="30" cy="50" r="3" fill="#c9a24a"/>`,
  banana: () => `<path d="M14 58Q30 40 46 50Q34 54 26 60Q20 62 14 58Z" fill="#f0d040"/><path d="M14 58Q30 44 44 50" fill="none" stroke="#c9a020" stroke-width="2"/><path d="M26 50L20 60M34 48L30 58" stroke="#e8c030" stroke-width="2"/><circle cx="45" cy="50" r="2" fill="#6a4a1a"/>`,
  robot: () => `${shadow(60)}<ellipse cx="30" cy="56" rx="18" ry="6" fill="#2a2a2e"/><ellipse cx="30" cy="53" rx="18" ry="6" fill="#3a3a40"/><ellipse cx="30" cy="53" rx="6" ry="2" fill="#555"/><circle cx="30" cy="53" r="1.3" fill="#5ad0a0"/>`,
};

// ───────────────────────── wall items (box WW × WH) ─────────────────────────
const W = {
  picture: () => `<rect x="14" y="4" width="64" height="40" fill="#3a2a1c"/><rect x="18" y="8" width="56" height="32" fill="#9ec0e0"/><path d="M18 30L34 18L46 28L58 14L74 32V40H18Z" fill="#5a7a4a"/><path d="M18 34L40 28L74 36V40H18Z" fill="#7a9a5a"/><circle cx="62" cy="16" r="4" fill="#fff3c0"/>`,
  abstract: () => `<rect x="12" y="2" width="68" height="44" fill="#f4f1ea" stroke="#222" stroke-width="2"/><circle cx="34" cy="22" r="12" fill="#d9444a"/><rect x="44" y="10" width="24" height="24" fill="#2a4a9a" opacity=".85"/><path d="M18 40L74 8" stroke="#222" stroke-width="3"/>`,
  mirror: () => `<ellipse cx="46" cy="24" rx="20" ry="22" fill="#b89a5a"/><ellipse cx="46" cy="24" rx="16" ry="18" fill="#cfe0ea"/><path d="M38 12Q46 8 54 14" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>`,
  clock: (ctx) => { const h = ctx?.hour ?? 10; const a = (h % 12) / 12 * 360, m = (h - Math.floor(h)) * 360; return `<circle cx="46" cy="24" r="20" fill="#3a2a1c"/><circle cx="46" cy="24" r="17" fill="#f6f2e8"/>${[0, 90, 180, 270].map(d => `<line x1="46" y1="9" x2="46" y2="12" stroke="#222" stroke-width="2" transform="rotate(${d} 46 24)"/>`).join('')}<line x1="46" y1="24" x2="46" y2="14" stroke="#222" stroke-width="2.4" transform="rotate(${a} 46 24)"/><line x1="46" y1="24" x2="46" y2="10" stroke="#222" stroke-width="1.5" transform="rotate(${m} 46 24)"/><circle cx="46" cy="24" r="1.5" fill="#222"/>`; },
  shelf: () => `<rect x="8" y="30" width="76" height="4" rx="1" fill="url(#gWood)"/><path d="M14 34L18 42M78 34L74 42" stroke="${WOOD2}" stroke-width="2"/><rect x="16" y="16" width="6" height="14" fill="#8a3b3b"/><rect x="23" y="12" width="6" height="18" fill="#3b5a8a"/><rect x="30" y="18" width="6" height="12" fill="#c9a24a"/><path d="M50 30V22M46 18A4 4 0 0 1 54 18V22H46Z" fill="#6a9a50"/><rect x="44" y="22" width="12" height="8" fill="#b5664a"/><rect x="64" y="20" width="12" height="10" rx="1" fill="#fff" stroke="#999"/>`,
  window: (ctx) => `<rect x="12" y="2" width="68" height="44" fill="#e9e4da"/><rect x="16" y="6" width="60" height="36" fill="${ctx?.night ? '#1b2340' : ctx?.evening ? '#e3a070' : '#9ec8ea'}"/>${ctx?.night ? '<circle cx="60" cy="14" r="4" fill="#f4f0d8"/>' : '<circle cx="62" cy="14" r="5" fill="#fff3b0"/>'}<path d="M46 6V42M16 24H76" stroke="#e9e4da" stroke-width="3"/><path d="M12 2H30V46H12Z" fill="#7a5a6a"/><path d="M62 2H80V46H62Z" fill="#7a5a6a"/><rect x="8" y="0" width="76" height="4" rx="1" fill="${WOOD2}"/>`,
  chandelier: () => `<path d="M46 0V12" stroke="${BRASS}" stroke-width="2"/><path d="M20 26Q46 10 72 26" fill="none" stroke="${BRASS}" stroke-width="2.5"/><path d="M46 12V22" stroke="${BRASS}" stroke-width="2"/>${[20, 33, 46, 59, 72].map((x, i) => `<rect x="${x - 2}" y="${(i === 0 || i === 4) ? 16 : i === 2 ? 14 : 15}" width="4" height="10" fill="#fff6c8"/><circle cx="${x}" cy="${(i === 0 || i === 4) ? 14 : i === 2 ? 12 : 13}" r="3" fill="#ffe28a"/>`).join('')}<circle cx="46" cy="30" r="5" fill="#e8d8a0" opacity=".9"/>`,
  tv: () => `<rect x="4" y="4" width="84" height="42" rx="2" fill="#141417"/><rect x="7" y="7" width="78" height="36" fill="url(#gScreen)"/><path d="M14 36L30 20L42 30L56 14L78 34" fill="none" stroke="#5ad0a0" stroke-width="2"/><circle cx="46" cy="44" r="1" fill="#d94a4a"/>`,
  camera: () => `<rect x="30" y="14" width="30" height="16" rx="3" fill="#e9e9ec" stroke="#999"/><rect x="58" y="16" width="10" height="12" rx="2" fill="#2a2a2e"/><circle cx="64" cy="22" r="3" fill="#4a6a9a"/><circle cx="35" cy="22" r="1.5" fill="#e03030"/><path d="M38 14V6H46" fill="none" stroke="#999" stroke-width="2"/>`,
  alarm: () => `<rect x="30" y="6" width="32" height="36" rx="3" fill="#f0c040" stroke="#b08020" stroke-width="1.5"/><path d="M46 14A8 8 0 0 1 54 22V30H38V22A8 8 0 0 1 46 14Z" fill="#2a2a2e"/><rect x="36" y="30" width="20" height="3" fill="#2a2a2e"/><circle cx="46" cy="36" r="1.6" fill="#e03030"/>`,
  cagetrap: () => `<rect x="44" y="0" width="4" height="8" fill="#555"/><path d="M26 8H66V22Q66 28 60 28H32Q26 28 26 22Z" fill="#6b6b70"/>${[30, 36, 42, 48, 54, 60].map(x => `<rect x="${x}" y="10" width="2" height="30" fill="#8a8a90"/>`).join('')}<rect x="26" y="38" width="40" height="3" fill="#6b6b70"/><path d="M40 4L46 0L52 4" fill="none" stroke="#c9a24a" stroke-width="2"/><text x="70" y="24" font-size="10" fill="#9a3b3b" font-family="sans-serif" font-weight="700">TRAP</text>`,
  speaker: () => `<rect x="36" y="18" width="20" height="26" rx="6" fill="#444"/><rect x="36" y="18" width="20" height="26" rx="6" fill="url(#pSlots)"/><rect x="38" y="20" width="16" height="3" rx="1.5" fill="#5ad0ff"/>`,
};

// ───────────────────────── garden items (box GW × GH) ─────────────────────────
const G = {
  tree: () => `<rect x="44" y="56" width="8" height="38" fill="${WOOD2}"/><circle cx="48" cy="40" r="26" fill="#4f7a3b"/><circle cx="34" cy="50" r="16" fill="#5b8a45"/><circle cx="62" cy="50" r="16" fill="#5b8a45"/><circle cx="48" cy="30" r="14" fill="#6a9a50"/>${[[34, 44], [56, 38], [48, 56], [62, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#d9444a"/>`).join('')}`,
  flowers: () => `<path d="M6 80Q48 70 90 80L90 94H6Z" fill="#5a3b25"/>${[14, 26, 38, 50, 62, 74, 86].map((x, i) => `<path d="M${x} 80V62" stroke="#4f7a3b" stroke-width="2"/><circle cx="${x}" cy="60" r="5" fill="${['#d9444a', '#f0c040', '#e88ab0', '#9a6ad0', '#f09050'][i % 5]}"/><circle cx="${x}" cy="60" r="1.6" fill="#fff3b0"/>`).join('')}`,
  bench: () => `<rect x="8" y="50" width="80" height="6" rx="1" fill="url(#gWood)"/><rect x="8" y="58" width="80" height="6" rx="1" fill="url(#gWood)"/><rect x="8" y="34" width="80" height="6" rx="1" fill="url(#gWood)"/><rect x="8" y="42" width="80" height="6" rx="1" fill="url(#gWood)"/><rect x="12" y="30" width="4" height="64" fill="#444"/><rect x="80" y="30" width="4" height="64" fill="#444"/><rect x="12" y="64" width="72" height="3" fill="#444"/>`,
  pond: () => `<ellipse cx="48" cy="72" rx="42" ry="18" fill="#6b6b5a"/><ellipse cx="48" cy="70" rx="36" ry="14" fill="url(#gWater)"/><ellipse cx="36" cy="66" rx="7" ry="3" fill="#4f7a3b"/><ellipse cx="58" cy="74" rx="6" ry="2.6" fill="#4f7a3b"/><circle cx="36" cy="64" r="2" fill="#e88ab0"/><path d="M62 66Q66 62 70 66" stroke="#f0a040" stroke-width="2" fill="none"/>`,
  trampoline: () => `<ellipse cx="48" cy="62" rx="40" ry="8" fill="#2a2a2e"/><ellipse cx="48" cy="60" rx="34" ry="5" fill="#3a5a7a"/><ellipse cx="48" cy="60" rx="34" ry="5" fill="none" stroke="#4a9ad9" stroke-width="1.5" stroke-dasharray="4 3"/><rect x="18" y="66" width="3" height="28" fill="#555"/><rect x="75" y="66" width="3" height="28" fill="#555"/><rect x="46" y="68" width="3" height="26" fill="#555"/><path d="M12 10V60M84 10V60M12 10H84" stroke="#7a8a9a" stroke-width="2" fill="none"/><path d="M12 20H84M12 30H84M12 40H84M12 50H84" stroke="#7a8a9a" opacity=".5"/>`,
  swing: () => `<path d="M10 94L30 10H66L86 94" fill="none" stroke="${WOOD2}" stroke-width="5"/><rect x="26" y="8" width="44" height="5" fill="${WOOD2}"/><path d="M40 13V64M56 13V64" stroke="#8a8a8a" stroke-width="2"/><rect x="34" y="62" width="28" height="5" rx="1" fill="url(#gWood)"/>`,
  bbq: () => `<ellipse cx="48" cy="46" rx="24" ry="8" fill="#2a2a2e"/><path d="M24 46Q24 70 48 70Q72 70 72 46Z" fill="#1e1e22"/><ellipse cx="48" cy="46" rx="20" ry="5" fill="#555"/><path d="M30 46H66M34 50H62" stroke="#888"/><rect x="34" y="40" width="8" height="5" fill="#8a4a3a"/><rect x="50" y="40" width="10" height="5" fill="#8a4a3a"/><path d="M36 70L30 94M60 70L66 94M48 70V94" stroke="#2a2a2e" stroke-width="3"/><path d="M40 34Q44 28 40 24M48 34Q52 28 48 24M56 34Q60 28 56 24" stroke="#bbb" fill="none" opacity=".7"/>`,
  shed: () => `<rect x="12" y="40" width="72" height="54" fill="url(#gWood)"/><path d="M6 42L48 12L90 42Z" fill="#5a4a42"/><rect x="40" y="56" width="18" height="38" fill="${WOOD2}"/><circle cx="54" cy="76" r="1.5" fill="${BRASS}"/><rect x="18" y="52" width="14" height="12" fill="#9ec8ea"/><path d="M12 48H84M12 60H84M12 72H84M12 84H84" stroke="rgba(0,0,0,.15)"/>`,
  car: () => `<path d="M8 70Q8 56 20 56L30 40H66L78 56Q90 56 90 70V80H8Z" fill="#8a2e2e"/><path d="M32 44H46V56H28ZM50 44H64L72 56H50Z" fill="#b8d8ea"/><rect x="8" y="72" width="82" height="8" fill="#6a1e1e"/><circle cx="26" cy="80" r="10" fill="#222"/><circle cx="26" cy="80" r="5" fill="#999"/><circle cx="72" cy="80" r="10" fill="#222"/><circle cx="72" cy="80" r="5" fill="#999"/><rect x="82" y="62" width="6" height="5" fill="#fff3b0"/><rect x="10" y="62" width="6" height="5" fill="#e03030"/>`,
  fountain: () => `<ellipse cx="48" cy="84" rx="40" ry="10" fill="#9a978f"/><ellipse cx="48" cy="82" rx="34" ry="7" fill="url(#gWater)"/><rect x="44" y="40" width="8" height="40" fill="#b5b2aa"/><ellipse cx="48" cy="42" rx="20" ry="6" fill="#9a978f"/><ellipse cx="48" cy="41" rx="16" ry="4" fill="url(#gWater)"/><path d="M48 36Q40 20 34 34M48 36Q56 20 62 34M48 36V18" stroke="#bfe0f0" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="48" cy="16" r="3" fill="#dff0f8"/>`,
  gnome: () => `<path d="M48 36L36 62H60Z" fill="#d94a4a"/><circle cx="48" cy="64" r="8" fill="#f1c9a5"/><path d="M40 68Q48 84 56 68Z" fill="#eee"/><rect x="40" y="72" width="16" height="16" rx="3" fill="#3b5a8a"/><rect x="38" y="86" width="20" height="8" fill="#5a3b25"/><circle cx="45" cy="63" r="1" fill="#222"/><circle cx="51" cy="63" r="1" fill="#222"/>`,
  lantern: () => `<rect x="46" y="40" width="4" height="54" fill="#2a2a2e"/><rect x="38" y="20" width="20" height="22" rx="2" fill="#2a2a2e"/><rect x="41" y="23" width="14" height="16" fill="#fff0b0"/><path d="M38 20L48 10L58 20Z" fill="#2a2a2e"/><rect x="40" y="90" width="16" height="4" fill="#2a2a2e"/>`,
  doorbell: () => `<rect x="44" y="40" width="8" height="54" fill="#8a8a8a"/><rect x="36" y="18" width="24" height="26" rx="4" fill="#2a2a2e"/><circle cx="48" cy="28" r="6" fill="#4a6a9a"/><circle cx="48" cy="28" r="2.5" fill="#1a2a3a"/><circle cx="48" cy="39" r="2" fill="#4a9ad9"/>`,
  outcam: () => `<rect x="46" y="30" width="4" height="64" fill="#8a8a8a"/><rect x="34" y="14" width="30" height="16" rx="3" fill="#e9e9ec" stroke="#999"/><rect x="62" y="16" width="10" height="12" rx="2" fill="#2a2a2e"/><circle cx="68" cy="22" r="3" fill="#4a6a9a"/><circle cx="39" cy="22" r="1.5" fill="#e03030"/><path d="M30 10Q48 4 70 10" fill="none" stroke="#999" stroke-width="2"/>`,
};

export function itemSvg(id, ctx = {}) {
  const it = ITEM[id]; if (!it) return '';
  if (it.kind === 'floor') { const w = FW * (it.size || 1); return `<svg viewBox="0 0 ${w} ${FH}" width="${w}" height="${FH}">${DEFS}${F[id] ? F[id](ctx) : ''}</svg>`; }
  if (it.kind === 'wall') return `<svg viewBox="0 0 ${WW} ${WH}" width="${WW}" height="${WH}">${DEFS}${W[id] ? W[id](ctx) : ''}</svg>`;
  if (it.kind === 'garden') return `<svg viewBox="0 0 ${GW} ${GH}" width="${GW}" height="${GH}">${DEFS}${G[id] ? G[id](ctx) : ''}</svg>`;
  return `<svg viewBox="0 0 60 66" width="60" height="66">${DEFS}<path d="M14 20H46L50 60H10Z" fill="#c9a24a"/><rect x="18" y="14" width="24" height="8" fill="#8a6a2a"/><circle cx="30" cy="40" r="8" fill="#5a3b25"/><text x="30" y="44" font-size="9" text-anchor="middle" fill="#fff" font-family="sans-serif">FOOD</text></svg>`;
}
export function itemInner(id, ctx) { const it = ITEM[id]; if (!it) return ''; return (it.kind === 'floor' ? F : it.kind === 'wall' ? W : G)[id]?.(ctx) || ''; }

// ───────────────────────── pets (box 44 × 40) ─────────────────────────
const P = {
  dog: () => `<ellipse cx="22" cy="38" rx="16" ry="2.5" fill="rgba(0,0,0,.15)"/><rect x="8" y="18" width="24" height="14" rx="6" fill="#b58a5a"/><rect x="10" y="30" width="4" height="8" fill="#a07a4a"/><rect x="26" y="30" width="4" height="8" fill="#a07a4a"/><rect x="26" y="8" width="14" height="14" rx="5" fill="#b58a5a"/><rect x="36" y="12" width="6" height="7" rx="2" fill="#6a4a2a"/><path d="M27 10L24 18" stroke="#7a5a3a" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="13" r="1.4" fill="#222"/><circle cx="41" cy="16" r="1.4" fill="#222"/><path d="M8 22Q2 14 6 10" stroke="#b58a5a" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="26" y="20" width="12" height="3" fill="#d94a4a"/>`,
  cat: () => `<ellipse cx="22" cy="38" rx="14" ry="2.5" fill="rgba(0,0,0,.15)"/><rect x="8" y="20" width="22" height="12" rx="6" fill="#55555a"/><rect x="10" y="30" width="3.5" height="8" fill="#4a4a4e"/><rect x="25" y="30" width="3.5" height="8" fill="#4a4a4e"/><circle cx="31" cy="16" r="7" fill="#55555a"/><path d="M26 11L25 4L30 9ZM36 11L37 4L32 9Z" fill="#55555a"/><circle cx="29" cy="15" r="1.2" fill="#a0d050"/><circle cx="34" cy="15" r="1.2" fill="#a0d050"/><path d="M8 24Q0 20 2 10" stroke="#55555a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  rabbit: () => `<ellipse cx="22" cy="38" rx="14" ry="2.5" fill="rgba(0,0,0,.15)"/><ellipse cx="20" cy="29" rx="13" ry="9" fill="#e6e0d6"/><circle cx="31" cy="22" r="7" fill="#e6e0d6"/><path d="M27 16Q26 2 30 4Q33 6 31 16ZM33 16Q35 2 38 5Q40 8 36 17Z" fill="#e6e0d6" stroke="#d9c7c0"/><circle cx="33" cy="21" r="1.2" fill="#222"/><circle cx="37" cy="23" r="1" fill="#e88ab0"/><circle cx="8" cy="28" r="3" fill="#fff"/>`,
  hamster: () => `<rect x="4" y="8" width="36" height="30" rx="3" fill="none" stroke="#999" stroke-width="1.5"/>${[10, 16, 22, 28, 34].map(x => `<path d="M${x} 8V38" stroke="#bbb" stroke-width=".8"/>`).join('')}<rect x="4" y="34" width="36" height="4" fill="#d9b24a"/><circle cx="28" cy="22" r="8" fill="none" stroke="#777" stroke-width="2"/><ellipse cx="16" cy="30" rx="7" ry="5" fill="#d9a060"/><circle cx="21" cy="28" r="3.5" fill="#d9a060"/><circle cx="22" cy="27" r=".9" fill="#222"/>`,
  fish: () => `<rect x="2" y="6" width="40" height="32" rx="2" fill="#bfe3f0" stroke="#777" stroke-width="1.5"/><rect x="3" y="10" width="38" height="27" fill="url(#gWater)"/><rect x="3" y="33" width="38" height="4" fill="#c9b27a"/><path d="M10 33Q12 20 14 33M18 33Q20 24 22 33" stroke="#4f7a3b" stroke-width="2" fill="none"/><ellipse cx="26" cy="20" rx="6" ry="3.5" fill="#f0a030"/><path d="M32 20L36 16V24Z" fill="#f0a030"/><circle cx="23" cy="19" r=".9" fill="#222"/><circle cx="15" cy="14" r="1.5" fill="#fff" opacity=".7"/>`,
  parrot: () => `<rect x="20" y="30" width="3" height="10" fill="#8a8a8a"/><rect x="10" y="30" width="24" height="2" fill="#8a8a8a"/><ellipse cx="22" cy="20" rx="7" ry="11" fill="#d94a4a"/><circle cx="22" cy="8" r="6" fill="#d94a4a"/><path d="M26 7L32 9L26 12Z" fill="#444"/><circle cx="23" cy="7" r="1.2" fill="#222"/><path d="M15 16Q10 22 14 30" stroke="#3b5a8a" stroke-width="3" fill="none"/><path d="M22 30L20 40" stroke="#f0c040" stroke-width="3"/><path d="M24 24Q30 20 28 14" stroke="#f0c040" stroke-width="3" fill="none"/>`,
  dragon: () => `<ellipse cx="22" cy="38" rx="18" ry="2.5" fill="rgba(0,0,0,.15)"/><path d="M4 30Q0 20 8 18" stroke="#3b7a5a" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="27" rx="14" ry="9" fill="#3b7a5a"/><rect x="12" y="32" width="5" height="7" fill="#2f6248"/><rect x="24" y="32" width="5" height="7" fill="#2f6248"/><path d="M14 18L18 8L22 18ZM22 18L26 10L28 18Z" fill="#6ab08a"/><rect x="28" y="12" width="14" height="11" rx="4" fill="#3b7a5a"/><path d="M30 10L34 2L36 11Z" fill="#6ab08a"/><circle cx="37" cy="16" r="1.5" fill="#f0c040"/><path d="M42 18L46 16L46 20Z" fill="#f08030"/><path d="M46 19Q50 17 52 21Q49 19 46 20Z" fill="#ffd040"/>`,
};
export function petSvg(type, size = 44) { return `<svg viewBox="0 0 44 40" width="${size}" height="${size * 40 / 44}">${DEFS}${P[type] ? P[type]() : ''}</svg>`; }
export function petInner(type) { return P[type] ? P[type]() : ''; }

export function cagedInner(trap) {
  const burglar = `<rect x="16" y="30" width="5" height="18" fill="#1f1f24"/><rect x="23" y="30" width="5" height="18" fill="#1f1f24"/><rect x="13" y="14" width="18" height="18" rx="3" fill="#2a2a30"/><path d="M13 18H31M13 23H31M13 28H31" stroke="#f0f0f0" stroke-width="2"/><circle cx="22" cy="8" r="7" fill="#e7c3a0"/><rect x="15" y="5" width="14" height="5" fill="#1f1f24"/><circle cx="19.5" cy="8" r="1" fill="#fff"/><circle cx="24.5" cy="8" r="1" fill="#fff"/>`;
  if (trap === 'net') return `${burglar}<path d="M4 52Q22 -4 40 52Z" fill="rgba(90,74,42,.25)" stroke="#5a4a2a" stroke-width="1.5"/><path d="M8 40H36M11 30H33M14 20H30M22 2V52M14 10L30 50M30 10L14 50" stroke="#5a4a2a" stroke-width="1"/><text x="30" y="12" font-size="12">💢</text>`;
  return `${burglar}<rect x="2" y="0" width="40" height="52" rx="4" fill="rgba(0,0,0,.08)" stroke="#6b6b70" stroke-width="3"/>${[9, 16, 23, 30, 37].map(x => `<rect x="${x}" y="2" width="2" height="50" fill="#8a8a90"/>`).join('')}<rect x="2" y="0" width="40" height="5" fill="#6b6b70"/><text x="30" y="12" font-size="12">💢</text>`;
}

// ───────────────────────── people ─────────────────────────
const SKINS = ['#f1c9a5', '#d9a67a', '#b07a4f', '#8a5a3a', '#f6dcc3', '#5b3a24'];
const HAIRS = ['#2a1a0e', '#5a3b25', '#c9a26f', '#8a2e2e', '#111', '#e0c070', '#6a4a3a'];
const TOPS = ['#3b5a8a', '#8a2e2e', '#2f5a3e', '#6a3d9a', '#c75b2a', '#55657a', '#d9444a', '#2a7a7a'];
export function lookFor(name) { let h = 7; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { skin: SKINS[h % SKINS.length], hair: HAIRS[(h >> 3) % HAIRS.length], top: TOPS[(h >> 6) % TOPS.length], trousers: ['#2a2a35', '#4a5a6a', '#5a4a3a'][(h >> 9) % 3] }; }
// adult: 30×64, child: 24×44, baby: 22×24 (all drawn with feet at y=H)
export function personInner(stage, name) {
  const L = lookFor(name);
  if (stage === 'baby') return `<ellipse cx="11" cy="23" rx="10" ry="2" fill="rgba(0,0,0,.15)"/><rect x="3" y="12" width="16" height="11" rx="5" fill="#f3e6ef"/><circle cx="11" cy="8" r="7" fill="${L.skin}"/><path d="M5 6Q11 0 17 6" fill="${L.hair}"/><circle cx="9" cy="8" r=".9" fill="#222"/><circle cx="13" cy="8" r=".9" fill="#222"/><circle cx="11" cy="11" r="1.2" fill="#e88ab0"/>`;
  if (stage === 'child') return `<ellipse cx="12" cy="43" rx="10" ry="2" fill="rgba(0,0,0,.15)"/><rect x="6" y="30" width="5" height="13" fill="${L.trousers}"/><rect x="13" y="30" width="5" height="13" fill="${L.trousers}"/><rect x="4" y="16" width="16" height="16" rx="3" fill="${L.top}"/><rect x="1" y="17" width="4" height="12" rx="2" fill="${L.skin}"/><rect x="19" y="17" width="4" height="12" rx="2" fill="${L.skin}"/><circle cx="12" cy="9" r="7.5" fill="${L.skin}"/><path d="M4.5 8Q12 -2 19.5 8L18 6Q12 3 6 6Z" fill="${L.hair}"/><circle cx="9.5" cy="9" r="1" fill="#222"/><circle cx="14.5" cy="9" r="1" fill="#222"/><path d="M9.5 12.5Q12 14.5 14.5 12.5" stroke="#9a5a4a" fill="none"/>`;
  return `<ellipse cx="15" cy="63" rx="12" ry="2.2" fill="rgba(0,0,0,.15)"/><rect x="8" y="40" width="6" height="22" fill="${L.trousers}"/><rect x="16" y="40" width="6" height="22" fill="${L.trousers}"/><rect x="6" y="60" width="8" height="3" fill="#222"/><rect x="16" y="60" width="8" height="3" fill="#222"/><rect x="5" y="20" width="20" height="22" rx="4" fill="${L.top}"/><rect x="1" y="22" width="5" height="16" rx="2.5" fill="${L.top}"/><rect x="24" y="22" width="5" height="16" rx="2.5" fill="${L.top}"/><rect x="1.5" y="34" width="4" height="5" rx="2" fill="${L.skin}"/><rect x="24.5" y="34" width="4" height="5" rx="2" fill="${L.skin}"/><circle cx="15" cy="11" r="9" fill="${L.skin}"/><path d="M6 10Q15 -3 24 10L22 8Q15 3 8 8Z" fill="${L.hair}"/><circle cx="12" cy="11" r="1.1" fill="#222"/><circle cx="18" cy="11" r="1.1" fill="#222"/><path d="M12 15Q15 17.5 18 15" stroke="#9a5a4a" fill="none"/>`;
}
export function personSvg(stage, name, scale = 1) { const [w, h] = stage === 'baby' ? [22, 24] : stage === 'child' ? [24, 44] : [30, 64]; return `<svg viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}">${personInner(stage, name)}</svg>`; }

// ───────────────────────── house interior ─────────────────────────
export function wallFill(id) { const w = WALLPAPERS.find(x => x.id === id) || WALLPAPERS[0]; return w; }
export function floorFill(id) { const f = FLOORS.find(x => x.id === id) || FLOORS[0]; return f; }

function layoutRooms(house) {
  const t = houseType(house);
  const total = houseWidth(house);
  const out = [];
  let idx = 0;
  t.floors.forEach((floor, fi) => {
    const fw = floor.reduce((a, [, w]) => a + w, 0);
    let x = ((total - fw) / 2) * U;
    for (const [, w] of floor) { out.push({ idx, x, y: fi * RH, w: w * U, h: RH, room: house.rooms[idx] }); x += w * U; idx++; }
  });
  return { rooms: out, floors: t.floors.length, width: total * U, height: t.floors.length * RH };
}
export function interiorSize(house) { const l = layoutRooms(house); return { w: l.width + 24, h: l.height + 30 }; }

// opts: {hour, night, evening, interactive, pets, family, player, label}
export function interiorSvg(house, opts = {}) {
  const L = layoutRooms(house);
  const pad = 12, W0 = L.width + pad * 2, H0 = L.height + 30;
  const night = !!opts.night, evening = !!opts.evening;
  const ctx = { hour: opts.hour, night, evening };
  let s = `<svg class="house" viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="xMidYMin meet">${DEFS}`;
  const labels = [];
  // roof + outer shell
  s += `<path d="M${pad - 8} 18L${W0 / 2} -2L${W0 - pad + 8} 18Z" fill="${house.paint.roof}" transform="translate(0 0)"/>`;
  s += `<rect x="${pad - 6}" y="0" width="${L.width + 12}" height="${L.height + 20}" rx="2" fill="#5a4a42"/>`;
  for (const r of L.rooms) {
    const wp = wallFill(r.room.wallpaper), fl = floorFill(r.room.flooring);
    const ry = r.y + 12, floorY = ry + r.h - 22;
    s += `<g class="room" data-room="${r.idx}" transform="translate(${r.x + pad} ${ry})">`;
    s += `<rect width="${r.w}" height="${r.h}" fill="${wp.color}"/>`;
    if (wp.pattern) s += `<rect width="${r.w}" height="${r.h}" fill="${PAT[wp.pattern]}"/>`;
    s += `<rect y="${r.h - 22}" width="${r.w}" height="22" fill="${fl.color}"/>`;
    if (fl.pattern) s += `<rect y="${r.h - 22}" width="${r.w}" height="22" fill="${PAT[fl.pattern]}"/>`;
    s += `<rect y="${r.h - 24}" width="${r.w}" height="3" fill="rgba(0,0,0,.18)"/>`;
    // wall slots
    r.room.wallSlots.forEach((id, si) => {
      const x = si * U + (U - WW) / 2, y = 10;
      if (id) s += `<g class="placed" data-kind="wall" data-slot="${si}" transform="translate(${x} ${y})"><rect width="${WW}" height="${WH}" fill="transparent"/>${itemInner(id, ctx)}</g>`;
      else if (opts.interactive) s += `<g class="slot wallslot" data-kind="wall" data-slot="${si}" transform="translate(${x} ${y})"><rect width="${WW}" height="${WH}" rx="4" fill="rgba(255,255,255,.18)" stroke="rgba(0,0,0,.25)" stroke-dasharray="4 3"/><text x="${WW / 2}" y="${WH / 2 + 5}" text-anchor="middle" font-size="16" fill="rgba(0,0,0,.35)">+</text></g>`;
    });
    // floor slots (empty-slot buttons are drawn after the occupants so pets never cover them)
    const fy = r.h - FH - 2; const emptyFloor = [];
    r.room.floorSlots.forEach((id, si) => {
      const x = si * FW;
      if (id && !id.startsWith('@')) { const it = ITEM[id]; const w = FW * (it.size || 1); s += `<g class="placed" data-kind="floor" data-slot="${si}" transform="translate(${x} ${fy})"><rect width="${w}" height="${FH}" fill="transparent"/>${itemInner(id, ctx)}</g>`; if (it.light && night) s += `<circle cx="${x + w / 2}" cy="${fy + 20}" r="${w}" fill="url(#gGlow)" pointer-events="none"/>`; }
      else if (!id && opts.interactive) emptyFloor.push(`<g class="slot floorslot" data-kind="floor" data-slot="${si}" transform="translate(${x} ${fy})"><rect x="3" y="20" width="${FW - 6}" height="${FH - 22}" rx="4" fill="rgba(255,255,255,.14)" stroke="rgba(0,0,0,.22)" stroke-dasharray="4 3" pointer-events="none"/><g class="plus"><circle cx="${FW / 2}" cy="${FH - 22}" r="14" fill="rgba(255,255,255,.85)" stroke="rgba(0,0,0,.35)"/><text x="${FW / 2}" y="${FH - 16}" text-anchor="middle" font-size="19" font-weight="700" fill="rgba(0,0,0,.5)">+</text></g></g>`);
    });
    // wall lights glow
    r.room.wallSlots.forEach((id, si) => { if (id && ITEM[id].light && night) s += `<circle cx="${si * U + U / 2}" cy="40" r="${U * .7}" fill="url(#gGlow)" pointer-events="none"/>`; });
    // occupants
    const occ = [];
    (opts.pets || []).forEach((p, i) => { if ((p.room % house.rooms.length) === r.idx) occ.push({ kind: 'pet', i, p }); });
    (opts.family || []).forEach((p, i) => { if ((p.room % house.rooms.length) === r.idx) occ.push({ kind: 'person', i, p }); });
    if (opts.player && opts.player.room === r.idx) occ.unshift({ kind: 'player', p: opts.player });
    occ.forEach((o, k) => {
      const ox = 8 + ((k * 37) % Math.max(40, r.w - 50));
      if (o.kind === 'pet') s += `<g class="pet" data-pet="${o.i}" transform="translate(${ox} ${r.h - 24 - 40})"><rect width="44" height="40" fill="transparent"/>${petInner(o.p.type)}${o.p.hunger >= 2 ? '<text x="40" y="8" font-size="12">🍖</text>' : o.p.fun <= 0 ? '<text x="40" y="8" font-size="12">💤</text>' : ''}</g>`;
      else if (o.kind === 'person') { const h = o.p.stage === 'baby' ? 24 : 44; s += `<g class="person" data-person="${o.i}" transform="translate(${ox} ${r.h - 24 - h})"><rect width="24" height="${h}" fill="transparent"/>${personInner(o.p.stage, o.p.name)}${o.p.hunger >= 2 ? '<text x="20" y="6" font-size="12">🍼</text>' : ''}</g>`; }
      else s += `<g class="player" transform="translate(${ox} ${r.h - 24 - 64})">${personInner('adult', o.p.name)}</g>`;
    });
    (opts.caged || []).forEach((c, i) => { if (c.room === r.idx) s += `<g class="caged" data-caged="${i}" transform="translate(${r.w - 54} ${r.h - 24 - 52})"><rect width="44" height="52" fill="transparent"/>${cagedInner(c.trap)}</g>`; });
    s += emptyFloor.join('');
    labels.push(`<g class="room" data-room="${r.idx}" transform="translate(${r.x + pad} ${ry})"><g class="roomlabel" data-room="${r.idx}"><rect x="4" y="-9" width="${Math.min(r.w - 8, r.room.name.length * 7.2 + 26)}" height="18" rx="9" fill="rgba(40,30,25,.78)"/><text x="12" y="4" font-size="11" fill="#fff" font-family="system-ui,sans-serif">${esc(r.room.name)}${opts.interactive ? ' ✎' : ''}</text></g></g>`);
    if (night) s += `<rect width="${r.w}" height="${r.h}" fill="#0b1026" opacity=".42" pointer-events="none"/>`;
    s += '</g>';
  }
  // wall dividers
  for (const r of L.rooms) s += `<rect x="${r.x + pad - 2}" y="${r.y + 12}" width="4" height="${r.h}" fill="#4a3a32" pointer-events="none"/>`;
  for (let f = 1; f <= L.floors; f++) s += `<rect x="${pad - 6}" y="${f * RH + 8}" width="${L.width + 12}" height="6" fill="#4a3a32" pointer-events="none"/>`;
  s += labels.join('');
  s += '</svg>';
  return s;
}

// ───────────────────────── house exterior ─────────────────────────
export function exteriorSvg(house, opts = {}) {
  const t = houseType(house);
  const total = houseWidth(house);
  const W0 = Math.max(total * U, 520) + 80, floorsN = t.floors.length;
  const groundY = 70 + floorsN * 90 + 10, H0 = groundY + 150;
  const night = !!opts.night, evening = !!opts.evening;
  const sky = night ? 'url(#gSkyNight)' : evening ? 'url(#gSkyEve)' : 'url(#gSkyDay)';
  let s = `<svg class="house outside" viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="xMidYMax meet">${DEFS}<rect width="${W0}" height="${H0}" fill="${sky}"/>`;
  if (night) { s += `<circle cx="${W0 - 80}" cy="50" r="18" fill="#f4f0d8"/>`; for (let i = 0; i < 24; i++) s += `<circle cx="${(i * 137) % W0}" cy="${(i * 53) % (groundY - 40)}" r="${1 + (i % 3) * .5}" fill="#fff" opacity=".8"/>`; }
  else s += `<circle cx="70" cy="${evening ? groundY - 40 : 44}" r="22" fill="${evening ? '#ffb070' : '#fff3b0'}"/>`;
  s += `<rect y="${groundY}" width="${W0}" height="${H0 - groundY}" fill="url(#gGrass)"/>`;
  const hx = (W0 - total * U) / 2, hw = total * U, top = groundY - floorsN * 90;
  // walls
  s += `<rect x="${hx}" y="${top}" width="${hw}" height="${floorsN * 90}" fill="${house.paint.wall}" stroke="rgba(0,0,0,.25)"/>`;
  if (house.type === 'castle') { s += `<rect x="${hx}" y="${top}" width="${hw}" height="${floorsN * 90}" fill="url(#pStone)" opacity=".5"/>`; for (let i = 0; i < hw / 24; i += 2) s += `<rect x="${hx + i * 24}" y="${top - 16}" width="24" height="18" fill="${house.paint.wall}" stroke="rgba(0,0,0,.25)"/>`; s += `<rect x="${hx - 30}" y="${top - 60}" width="60" height="${floorsN * 90 + 60}" fill="${house.paint.wall}" stroke="rgba(0,0,0,.25)"/><rect x="${hx + hw - 30}" y="${top - 60}" width="60" height="${floorsN * 90 + 60}" fill="${house.paint.wall}" stroke="rgba(0,0,0,.25)"/><path d="M${hx - 34} ${top - 60}L${hx} ${top - 100}L${hx + 34} ${top - 60}Z" fill="${house.paint.roof}"/><path d="M${hx + hw - 34} ${top - 60}L${hx + hw} ${top - 100}L${hx + hw + 34} ${top - 60}Z" fill="${house.paint.roof}"/><path d="M${hx} ${top - 100}V${top - 130}L${hx + 26} ${top - 122}L${hx} ${top - 114}Z" fill="#8a2e2e"/>`; }
  else { const rh = Math.min(52, Math.round(hw * 0.07) + 10); s += `<path d="M${hx - 14} ${top + 2}L${hx + hw / 2} ${top - rh}L${hx + hw + 14} ${top + 2}Z" fill="${house.paint.roof}"/><rect x="${hx + hw * .68}" y="${top - rh + 8}" width="18" height="${rh - 2}" fill="#6a5a52"/>`; }
  // windows per unit per floor
  for (let f = 0; f < floorsN; f++) for (let u = 0; u < total; u++) {
    const wx = hx + u * U + 34, wy = top + f * 90 + 18;
    const isDoor = f === floorsN - 1 && u === Math.floor(total / 2);
    if (isDoor) { s += `<rect x="${wx - 4}" y="${wy + 6}" width="56" height="66" rx="3" fill="${house.paint.door}" stroke="rgba(0,0,0,.3)"/><circle cx="${wx + 42}" cy="${wy + 40}" r="2.5" fill="${BRASS}"/><rect x="${wx + 8}" y="${wy + 14}" width="32" height="14" rx="2" fill="#9ec8ea" opacity=".8"/>`; continue; }
    const lit = night && ((u + f) % 2 === 0);
    s += `<rect x="${wx}" y="${wy}" width="52" height="46" fill="#e9e4da"/><rect x="${wx + 4}" y="${wy + 4}" width="44" height="38" fill="${lit ? '#ffe9a8' : night ? '#1b2340' : '#8fb8d8'}"/><path d="M${wx + 26} ${wy + 4}V${wy + 42}M${wx + 4} ${wy + 23}H${wx + 48}" stroke="#e9e4da" stroke-width="3"/>`;
    if (lit) s += `<rect x="${wx - 10}" y="${wy - 10}" width="72" height="66" fill="url(#gGlow)" pointer-events="none"/>`;
  }
  // path
  s += `<path d="M${hx + hw / 2 - 30} ${groundY}L${hx + hw / 2 + 30} ${groundY}L${hx + hw / 2 + 60} ${H0}L${hx + hw / 2 - 60} ${H0}Z" fill="#c9c3b6" opacity=".9"/>`;
  // garden slots
  const n = house.garden.length, gap = (W0 - 20) / n;
  house.garden.forEach((id, i) => {
    const gx = 10 + i * gap + (gap - GW) / 2, gy = groundY + 20 + (i % 2) * 22;
    if (id) { s += `<g class="placed" data-kind="garden" data-slot="${i}" transform="translate(${gx} ${gy})"><rect width="${GW}" height="${GH}" fill="transparent"/>${itemInner(id, { night })}</g>`; if (ITEM[id].light && night) s += `<circle cx="${gx + GW / 2}" cy="${gy + 30}" r="70" fill="url(#gGlow)" pointer-events="none"/>`; }
    else if (opts.interactive) s += `<g class="slot gardenslot" data-kind="garden" data-slot="${i}" transform="translate(${gx} ${gy})"><rect x="6" y="30" width="${GW - 12}" height="${GH - 36}" rx="8" fill="rgba(255,255,255,.2)" stroke="rgba(0,0,0,.3)" stroke-dasharray="5 4"/><text x="${GW / 2}" y="${GH / 2 + 14}" text-anchor="middle" font-size="22" fill="rgba(0,0,0,.4)">+</text></g>`;
  });
  if (night) s += `<rect width="${W0}" height="${H0}" fill="#0b1026" opacity=".25" pointer-events="none"/>`;
  s += '</svg>';
  return s;
}

export function houseThumb(typeId, paint) {
  const t = { flat: 1, terrace: 2, detached: 2, castle: 3 }[typeId], w = { flat: 5, terrace: 4, detached: 6, castle: 6 }[typeId];
  const p = paint || { wall: '#e8dcc4', roof: '#5a4a42', door: '#2b3a55' };
  let s = `<svg viewBox="0 0 160 110" width="160" height="110">`;
  s += `<rect width="160" height="110" fill="#d8e9f7"/><rect y="86" width="160" height="24" fill="#6a9a50"/>`;
  const hw = w * 20, hx = (160 - hw) / 2, hh = t * 24, top = 86 - hh;
  s += `<rect x="${hx}" y="${top}" width="${hw}" height="${hh}" fill="${p.wall}" stroke="rgba(0,0,0,.25)"/>`;
  if (typeId === 'castle') s += `<rect x="${hx - 10}" y="${top - 18}" width="18" height="${hh + 18}" fill="${p.wall}" stroke="rgba(0,0,0,.25)"/><rect x="${hx + hw - 8}" y="${top - 18}" width="18" height="${hh + 18}" fill="${p.wall}" stroke="rgba(0,0,0,.25)"/><path d="M${hx - 12} ${top - 18}L${hx - 1} ${top - 32}L${hx + 10} ${top - 18}Z" fill="${p.roof}"/><path d="M${hx + hw - 10} ${top - 18}L${hx + hw + 1} ${top - 32}L${hx + hw + 12} ${top - 18}Z" fill="${p.roof}"/>`;
  else s += `<path d="M${hx - 6} ${top}L${hx + hw / 2} ${top - 20}L${hx + hw + 6} ${top}Z" fill="${p.roof}"/>`;
  for (let f = 0; f < t; f++) for (let u = 0; u < w; u++) { const isDoor = f === t - 1 && u === Math.floor(w / 2); s += isDoor ? `<rect x="${hx + u * 20 + 5}" y="${top + f * 24 + 6}" width="10" height="18" fill="${p.door}"/>` : `<rect x="${hx + u * 20 + 5}" y="${top + f * 24 + 6}" width="10" height="10" fill="#8fb8d8"/>`; }
  return s + '</svg>';
}

// ───────────────────────── burglar (morning report) ─────────────────────────
export function burglarSvg(outcome = 'scared') {
  const body = `<ellipse cx="50" cy="94" rx="26" ry="3" fill="rgba(0,0,0,.15)"/><rect x="36" y="56" width="10" height="34" fill="#1f1f24"/><rect x="50" y="56" width="10" height="34" fill="#1f1f24"/><rect x="34" y="88" width="13" height="5" fill="#111"/><rect x="49" y="88" width="13" height="5" fill="#111"/>
    <rect x="30" y="30" width="36" height="30" rx="5" fill="#2a2a30"/><path d="M30 36H66M30 42H66M30 48H66M30 54H66" stroke="#f0f0f0" stroke-width="3"/>
    <rect x="22" y="32" width="9" height="22" rx="4" fill="#2a2a30"/><rect x="65" y="32" width="9" height="22" rx="4" fill="#2a2a30"/>
    <circle cx="48" cy="18" r="12" fill="#e7c3a0"/><rect x="36" y="13" width="24" height="8" fill="#1f1f24"/><circle cx="44" cy="17" r="1.6" fill="#fff"/><circle cx="53" cy="17" r="1.6" fill="#fff"/><path d="M34 10Q48 -2 62 10Z" fill="#1f1f24"/>`;
  const sack = `<path d="M74 42Q92 40 90 62Q88 78 74 76Q62 74 64 58Q66 46 74 42Z" fill="#b8905f"/><path d="M72 42L80 36" stroke="#8b5e3c" stroke-width="3"/>`;
  const extra = outcome === 'caught' ? `<rect x="14" y="6" width="22" height="22" rx="3" fill="#e9e9ec" stroke="#999"/><circle cx="25" cy="17" r="5" fill="#4a6a9a"/><circle cx="18" cy="11" r="1.6" fill="#e03030"/><path d="M4 70Q10 60 20 66" stroke="#4a9ad9" stroke-width="4" fill="none" stroke-linecap="round"/><text x="2" y="92" font-size="12" font-family="sans-serif" fill="#2b2420">POLICE</text>`
    : outcome === 'scared' ? `<text x="4" y="30" font-size="22">💨</text><text x="68" y="16" font-size="16">!</text>`
    : outcome === 'robbed' ? sack + `<text x="4" y="30" font-size="18">🤫</text>`
    : outcome === 'trapped' ? `<rect x="14" y="2" width="68" height="92" rx="5" fill="rgba(0,0,0,.06)" stroke="#6b6b70" stroke-width="4"/>${[26, 38, 50, 62, 74].map(x => `<rect x="${x}" y="4" width="3" height="88" fill="#8a8a90"/>`).join('')}<rect x="14" y="2" width="68" height="7" fill="#6b6b70"/><text x="78" y="24" font-size="16">💢</text>`
    : outcome === 'slipped' ? `<path d="M4 90Q22 76 40 84Q28 88 18 94Q10 96 4 90Z" fill="#f0d040"/><text x="2" y="40" font-size="20">💫</text><text x="70" y="40" font-size="16">!</text>`
    : `<text x="6" y="30" font-size="18">🤷</text>`;
  return `<svg viewBox="0 0 100 100">${body}${extra}</svg>`;
}
