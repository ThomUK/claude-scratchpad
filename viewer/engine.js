// Data viewer engine: DOM-free. Turns manifest.json into an index of tables
// and formats preview cells. Tested by tests/engine.test.mjs.

export const DATA_BASE = 'https://thomuk.github.io/synthetic-hospital-data/data/';
export const RELEASE_BASE = 'https://github.com/ThomUK/synthetic-hospital-data/releases/download/';

export const LAYERS = [
  { id: 'layer1', label: 'Layer 1: source extracts', blurb: 'What the source systems hand over: the PAS event log and appointment tables, the ED tracking board, the radiology system and the endoscopy vendor export. Deliberately messy.' },
  { id: 'reference', label: 'Reference', blurb: 'Sites, wards, specialties, clinics, consultants, the exam catalogue and the national code lists.' },
  { id: 'derived', label: 'Layer 2: derived entities', blurb: 'Rebuilt from the events by the SQL in sql/derive: spells, episodes, ward stays, attendances, appointments, pathways and exams in HES and ECDS shapes, plus the master patient index.' },
  { id: 'aggregate', label: 'Layer 3: aggregates', blurb: 'National-return shapes computed from layer 2 by sql/aggregate: monthly A&E, APC and outpatient counts, DM01, DID, RTT incomplete, the midnight census and daily flow.' },
  { id: 'answers', label: 'Answers', blurb: 'The mess log (every injected imperfection with its original value) and the clean truth tables the derived layer is marked against.' },
];

export const DESCRIPTIONS = {
  'layer1/pas_patients': 'PAS patient master: MRN, fake NHS number, demographics, GP practice, death date.',
  'layer1/pas_adt_events': 'HL7 v2 ADT-style event stream: A04 register, A01 admit, A02 transfer, A03 discharge, A08 update, A11/A13 cancellations, A40 merge. Everything inpatient is derived from it.',
  'layer1/ed_attendances': 'ED system export, ECDS v4-shaped, one row per attendance with its own patient identifier.',
  'layer1/ed_status_log': 'ED tracking-board audit trail: every status change with its timestamp.',
  'layer1/pas_referrals': 'Referrals received, with RTT clock starts and the waiting-list decision.',
  'layer1/pas_outpatient_appointments': 'Outpatient appointments as booked, attended, cancelled or DNA.',
  'layer1/pas_op_status_log': 'Appointment audit trail: every booking, rebooking, outcome and correction, in the order they were keyed.',
  'layer1/ris_imaging': 'Radiology system extract: CT, MRI and ultrasound requests and exams, DID-shaped, with different cleanliness by modality team.',
  'layer1/endo_procedures': 'Endoscopy vendor export with its own column conventions and date formats.',
  'derived/patients': 'Master patient index after MRN merges and NHS number linking.',
  'derived/patient_identifiers': 'Every identifier seen for each person across systems.',
  'derived/mrn_map': 'Which surviving person each MRN resolves to.',
  'derived/spells': 'Hospital provider spells (HES APC shape) rebuilt from A01/A03 pairs, honouring cancellations and inferring lost discharges.',
  'derived/episodes': 'Consultant episodes within spells, split on consultant or specialty change.',
  'derived/ward_stays': 'Ward stays from the A02 transfers, with ward names normalised.',
  'derived/ed_attendances': 'ED attendances with first-reached statuses, clock-corrected times and the link to the admitting spell.',
  'derived/op_appointments': 'Outpatient appointments in HES OP shape, with bounce flags from the audit trail.',
  'derived/rtt_pathways': 'RTT pathways with clock starts, stops and the reason.',
  'derived/imaging_exams': 'Imaging exams deduplicated, with UTC/BST corrected times and request-to-report intervals.',
  'derived/endoscopy_procedures': 'Endoscopy procedures with dates parsed, sites normalised, spell links and DM01 category.',
  'derived/ref_ward_names': 'Ward name variants seen in the PAS mapped to the ward reference.',
  'aggregate/midnight_census': 'Occupied beds at midnight by site and ward.',
  'aggregate/daily_flow': 'Admissions, discharges and ED arrivals per day.',
  'aggregate/ae_monthly': 'A&E monthly return shape: attendances, four-hour performance, admissions.',
  'aggregate/apc_monthly': 'HES APC monthly counts by admission method and specialty.',
  'aggregate/op_monthly': 'HES OP monthly counts by attendance type.',
  'aggregate/dm01_snapshot': 'DM01 diagnostic waiting list snapshot by modality.',
  'aggregate/did_extract': 'DID extract shape (Annex 2): one row per exam.',
  'aggregate/did_monthly': 'DID monthly activity and turnaround by modality.',
  'aggregate/rtt_incomplete': 'RTT incomplete pathways by week band at each month end.',
  'aggregate/endoscopy_monthly': 'Endoscopy monthly activity by category.',
  'answers/mess_log': 'Every injected imperfection: catalogue code, table, row key, column, original and messy value.',
  'answers/truth/spells': 'The clean spells the generator produced before mess injection.',
  'answers/truth/stays': 'The clean ward stays.',
  'answers/truth/ed_admitted': 'Which ED attendances were truly admitted and to which spell.',
  'answers/truth/mrn_aliases': 'The true MRN merges.',
  'answers/truth/imaging_links': 'Which imaging exams belong to which attendance, spell or appointment.',
  'answers/truth/endoscopy_links': 'Which endoscopy procedures belong to which spell or appointment.',
  'reference/sites': 'The two hospitals.',
  'reference/wards': 'Wards and locations with site, specialty, bed count and kind.',
  'reference/beds': 'One row per bed space with its ward, bay, label and bed type (bed, recliner, trolley, chair).',
  'reference/specialties': 'Treatment function codes and names.',
  'reference/consultants': 'Fictional consultant codes by specialty.',
  'reference/clinics': 'Outpatient clinics by site and specialty.',
  'reference/exam_catalogue': 'Imaging exams: NICIP code, SNOMED, modality and durations.',
  'reference/ecds_codes': 'ECDS code lists with SNOMED concept IDs from the ETOS.',
  'reference/admission_method': 'HES ADMIMETH codes.',
  'reference/admission_source': 'HES ADMISORC codes.',
  'reference/discharge_method': 'HES DISMETH codes.',
  'reference/discharge_destination': 'HES DISDEST codes.',
  'reference/attendance_status': 'HES outpatient ATTENDED codes.',
  'reference/patient_source_setting': 'DID patient source setting codes.',
};

export function layerOf(key) {
  return key.split('/')[0];
}

export function assetName(path) {
  // "v1/full/layer1/pas_adt_events/fy2023.parquet" -> "layer1__pas_adt_events__fy2023.parquet"
  const parts = path.split('/');
  const i = parts.indexOf('full');
  return parts.slice(i >= 0 ? i + 1 : 0).join('__');
}

export function releaseUrl(version, path) {
  return RELEASE_BASE + version + '/' + assetName(path);
}

export function sampleUrl(path) {
  return DATA_BASE + path;
}

export function previewPath(dataRoot, key) {
  return `${dataRoot}preview/sample/${key.replace(/\//g, '__')}.json`;
}

function entry(v) {
  if (!v) return null;
  return { rows: v.rows ?? null, bytes: v.files.reduce((s, f) => s + f.bytes, 0), files: v.files.map((f) => f.path) };
}

// Index of tables grouped by layer, in LAYERS order. Zip and other non-table
// entries are listed under `extras`.
export function buildIndex(manifest) {
  const keys = new Set([...Object.keys(manifest.full || {}), ...Object.keys(manifest.sample || {})]);
  const tables = [];
  const extras = [];
  for (const key of keys) {
    const full = entry(manifest.full?.[key]);
    const sample = entry(manifest.sample?.[key]);
    const isTable = (full && full.rows != null) || (sample && sample.rows != null);
    const item = { key, name: key.split('/').slice(1).join('/'), layer: layerOf(key), full, sample, description: DESCRIPTIONS[key] || '' };
    (isTable ? tables : extras).push(item);
  }
  const groups = LAYERS.map((l) => ({ ...l, tables: tables.filter((t) => t.layer === l.id).sort((a, b) => a.key.localeCompare(b.key)) }))
    .filter((g) => g.tables.length);
  return { version: manifest.version, groups, extras, totals: manifest.totals || {} };
}

export function fmtInt(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('en-GB');
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

// Cell text for the preview grid. null is returned as null so the renderer
// can style it; everything else is a string.
export function formatCell(v, type) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => formatCell(x, 'VARCHAR') ?? 'null').join(', ');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (type === 'DOUBLE' || type === 'FLOAT' || !Number.isInteger(v)) return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
    return String(v);
  }
  return String(v);
}

export function isNumericType(type) {
  return /INT|DOUBLE|FLOAT|DECIMAL|HUGEINT/.test(type);
}

export function parseRoute(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  if (!h) return { view: 'index' };
  // older links carried a sample/ or full/ prefix
  const key = h.replace(/^(full|sample)\//, '');
  return /^[a-z0-9_]+(\/[a-z0-9_]+)+$/.test(key) ? { view: 'table', key } : { view: 'index' };
}

export function routeFor(key) {
  return `#/${key}`;
}

