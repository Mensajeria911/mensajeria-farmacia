import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon.jsx';
import { SERVICE_LABELS } from '../lib/operations.js';
import {
  billingReport,
  companyEarnings,
  createUser,
  dayOf,
  listAllBranches,
  listPeriodServices,
  listProfiles,
  listRates,
  listZones,
  localDay,
  payrollDays,
  payrollReport,
  saveBranchLocation,
  setBranchActive,
  setPayrollDayPaid,
  setProfileActive,
  subscribeToAdmin,
  updateProfile,
  updateRate
} from '../lib/admin.js';
import '../admin.css';

const NAV = [
  ['stats', 'Estadísticas', 'grid'],
  ['earnings', 'Ganancias', 'wallet'],
  ['users', 'Usuarios', 'users'],
  ['rates', 'Tarifas', 'edit'],
  ['locations', 'Ubicación', 'pin'],
  ['branches', 'Sedes', 'store'],
  ['payroll', 'Liquidación', 'check'],
  ['billing', 'Cobro a farmacias', 'inbox']
];
const ROLE_LABELS = { courier: 'Domiciliario', pharmacy: 'Farmacia', central: 'Central', admin: 'Administrador' };
const PAYMENT_LABELS = { cash: 'Efectivo', card: 'Datáfono', none: 'Sin pago' };
const LiveContext = createContext({ revision: 0, notify: () => {} });

const money = value => '$' + Number(value || 0).toLocaleString('es-CO');
const courierPay = row => row.courier_fee_cop ?? row.fee_cop;
const dayLabel = day => new Date(day + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
// El celular reporta cada minuto; 10 sin noticias significa que dejó de hacerlo.
const isReporting = courier => Boolean(courier.available && courier.last_location_at) && Date.now() - new Date(courier.last_location_at).getTime() <= 600000;
const timeLabel = value => new Date(value).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });

// Recarga sola con cada cambio en vivo, sin borrar lo que ya se ve mientras tanto.
function useLive(load, deps) {
  const { revision } = useContext(LiveContext);
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    let alive = true;
    Promise.resolve(load()).then(result => {
      if (!alive) return;
      setState(current => result.error ? { ...current, error: result.error.message || 'No se pudo cargar.' } : { data: result.data || [], error: '' });
    });
    return () => { alive = false; };
  }, [revision, ...deps]);
  return state;
}

export function AdminPortal({ profile, onOperateBranch, onSignOut }) {
  const [section, setSection] = useState('stats');
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState(null);
  const notify = useCallback((type, message) => setNotice({ type, message }), []);
  const bump = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(bump, 400); };
    const unsubscribe = subscribeToAdmin(schedule, setOnline);
    const backup = setInterval(bump, 30000);
    window.addEventListener('online', schedule);
    return () => { clearTimeout(timer); clearInterval(backup); window.removeEventListener('online', schedule); unsubscribe(); };
  }, [bump]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4800);
    return () => clearTimeout(timer);
  }, [notice]);

  const profiles = useShared(listProfiles, revision);
  const branches = useShared(listAllBranches, revision);
  const context = useMemo(() => ({ revision, notify, refresh: bump }), [revision, notify, bump]);
  const title = NAV.find(item => item[0] === section)[1];

  return <LiveContext.Provider value={context}><div className="ap-shell">
    <aside className="ap-side">
      <div className="ap-brand"><img src={`${import.meta.env.BASE_URL}assets/farmanortedromedicas_logo.jpg`} alt="farmanorte droguerías" /><div><strong>Administración</strong><span>{profile.full_name}</span></div></div>
      <nav className="ap-nav" aria-label="Administración">{NAV.map(([id, label, icon]) => <button key={id} type="button" className={section === id ? 'is-active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}><Icon name={icon} size={18} />{label}</button>)}</nav>
      <div className="ap-side-foot">
        <button type="button" onClick={onOperateBranch}><Icon name="store" size={16} />Operar una sede</button>
        <button type="button" onClick={onSignOut}><Icon name="logout" size={16} />Cerrar sesión</button>
      </div>
    </aside>
    <main className="ap-main">
      <header className="ap-head"><h1>{title}</h1><span className={'ap-live ' + (online ? 'is-on' : '')}><i />{online ? 'En vivo' : 'Reconectando'}</span></header>
      {section === 'stats' && <StatsPage profiles={profiles} branches={branches} onOpen={setSection} />}
      {section === 'earnings' && <EarningsPage />}
      {section === 'users' && <UsersPage profiles={profiles} branches={branches} />}
      {section === 'rates' && <RatesPage userId={profile.id} />}
      {section === 'locations' && <LocationsPage profiles={profiles} />}
      {section === 'branches' && <BranchesPage branches={branches} />}
      {section === 'payroll' && <PayrollPage />}
      {section === 'billing' && <BillingPage />}
    </main>
    {notice && <div className={'toast toast--' + notice.type} role="status"><span className="toast-icon"><Icon name={notice.type === 'success' ? 'check' : 'close'} size={16} /></span><span>{notice.message}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}><Icon name="close" size={15} /></button></div>}
  </div></LiveContext.Provider>;
}

function useShared(load, revision) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    load().then(result => { if (alive && !result.error) setRows(result.data || []); });
    return () => { alive = false; };
  }, [load, revision]);
  return rows;
}

function usePeriod(days = 7) {
  const [from, setFrom] = useState(() => localDay(1 - days));
  const [to, setTo] = useState(() => localDay());
  return { from, to, setFrom, setTo };
}

function PeriodFilter({ period }) {
  const { from, to, setFrom, setTo } = period;
  const presets = [['Hoy', localDay(), localDay()], ['7 días', localDay(-6), localDay()], ['30 días', localDay(-29), localDay()]];
  return <div className="ap-filters">
    <div className="ap-tabs">{presets.map(([label, start, end]) => <button key={label} type="button" className={from === start && to === end ? 'is-active' : ''} onClick={() => { setFrom(start); setTo(end); }}>{label}</button>)}</div>
    <label>Desde<input type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} /></label>
    <label>Hasta<input type="date" value={to} min={from} onChange={event => event.target.value && setTo(event.target.value)} /></label>
  </div>;
}

function Kpi({ label, value, note, onClick }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return onClick ? <button type="button" className="ap-kpi ap-kpi--link" onClick={onClick}>{body}</button> : <div className="ap-kpi">{body}</div>;
}

function Panel({ title, children }) {
  return <section className="ap-panel"><h2>{title}</h2>{children}</section>;
}

function Failure({ error }) {
  return error ? <div className="ap-error" role="alert"><Icon name="close" size={16} />{error}</div> : null;
}

function Empty({ text }) {
  return <p className="ap-empty">{text}</p>;
}

function Table({ headers, rows, empty }) {
  if (!rows.length) return <Empty text={empty} />;
  return <div className="ap-scroll"><table className="ap-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.key}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Bar({ value, max, label }) {
  const width = max > 0 ? Math.max(value > 0 ? 3 : 0, value / max * 100) : 0;
  return <span className="ap-bar-cell"><strong>{label ?? value}</strong><span className="ap-bar" aria-hidden="true"><i style={{ width: width + '%' }} /></span></span>;
}

// Quién va primero y quién de último; si varios empatan se dice cuántos son.
function extremes(items, field) {
  if (!items.length) return null;
  const values = items.map(item => item[field]);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const pick = target => {
    const names = items.filter(item => item[field] === target).map(item => item.name);
    return names.length > 1 ? `${names[0]} y ${names.length - 1} más` : names[0];
  };
  return { high, low, top: high === low && items.length > 1 ? 'Todos igual' : pick(high), bottom: high === low && items.length > 1 ? 'Todos igual' : pick(low) };
}

function Highlights({ title, items, unit }) {
  const count = extremes(items, 'count');
  const margin = extremes(items, 'margin');
  if (!count) return null;
  return <Panel title={title}><div className="ap-highlights">
    <Kpi label={`Más ${unit}`} value={count.top} note={count.high} />
    <Kpi label={`Menos ${unit}`} value={count.bottom} note={count.low} />
    <Kpi label="Más ganancia" value={margin.top} note={money(margin.high)} />
    <Kpi label="Menos ganancia" value={margin.bottom} note={money(margin.low)} />
  </div></Panel>;
}

function StatsPage({ profiles, branches, onOpen }) {
  const period = usePeriod(7);
  const { from, to } = period;
  const services = useLive(() => listPeriodServices(from, to), [from, to]);
  const rates = useLive(listRates, []);

  const stats = useMemo(() => {
    const rows = services.data || [];
    const inRange = value => { if (!value) return false; const day = dayOf(value); return day >= from && day <= to; };
    const blank = name => ({ name, published: 0, count: 0, cancelled: 0, open: 0, billed: 0, paid: 0, margin: 0 });
    const byBranch = new Map(branches.filter(item => item.active).map(item => [item.id, blank(item.name)]));
    const couriers = profiles.filter(item => item.role === 'courier');
    const byCourier = new Map(couriers.filter(item => item.active).map(item => [item.id, { ...blank(item.full_name), available: isReporting(item) }]));
    const byType = new Map();
    const byPayment = new Map();
    const byDay = new Map();
    const total = { published: 0, delivered: 0, cancelled: 0, open: 0, billed: 0, paid: 0, margin: 0, pending: 0 };
    const branchOf = id => {
      if (!byBranch.has(id)) byBranch.set(id, blank(branches.find(item => item.id === id)?.name || 'Sede'));
      return byBranch.get(id);
    };
    const courierOf = id => {
      if (!byCourier.has(id)) byCourier.set(id, blank(couriers.find(item => item.id === id)?.full_name || 'Domiciliario'));
      return byCourier.get(id);
    };
    rows.forEach(row => {
      const branch = branchOf(row.branch_id);
      if (inRange(row.created_at)) {
        total.published += 1;
        branch.published += 1;
        byType.set(row.service_type, (byType.get(row.service_type) || 0) + 1);
        byPayment.set(row.payment_method, (byPayment.get(row.payment_method) || 0) + 1);
        if (row.status === 'cancelled') { total.cancelled += 1; branch.cancelled += 1; }
      }
      if (['unassigned', 'assigned', 'enroute'].includes(row.status)) {
        total.open += 1;
        branch.open += 1;
        if (row.assigned_courier_id) courierOf(row.assigned_courier_id).open += 1;
      }
      if (row.status === 'delivered' && inRange(row.delivered_at)) {
        const billed = row.general_fee_cop;
        const paid = courierPay(row);
        // Igual que company_earnings: sin ambas tarifas no se cuenta ganancia.
        const margin = billed != null && paid != null ? billed - paid : 0;
        if (billed == null || paid == null) total.pending += 1;
        const targets = [branch, row.assigned_courier_id ? courierOf(row.assigned_courier_id) : null].filter(Boolean);
        targets.forEach(item => { item.count += 1; item.billed += billed || 0; item.paid += paid || 0; item.margin += margin; });
        total.delivered += 1; total.billed += billed || 0; total.paid += paid || 0; total.margin += margin;
        const day = dayOf(row.delivered_at);
        byDay.set(day, (byDay.get(day) || 0) + 1);
      }
    });
    const sorted = map => [...map.values()].sort((a, b) => b.count - a.count || b.margin - a.margin || a.name.localeCompare(b.name));
    return { total, branches: sorted(byBranch), couriers: sorted(byCourier), byType, byPayment, byDay };
  }, [services.data, branches, profiles, from, to]);

  const { total } = stats;
  const couriers = profiles.filter(item => item.role === 'courier' && item.active);
  const connected = couriers.filter(isReporting).length;
  const noPrice = (rates.data || []).filter(item => item.general_price_cop == null || item.courier_price_cop == null).length;
  const maxBranch = Math.max(0, ...stats.branches.map(item => item.count));
  const maxCourier = Math.max(0, ...stats.couriers.map(item => item.count));
  const maxType = Math.max(0, ...stats.byType.values());
  const maxPayment = Math.max(0, ...stats.byPayment.values());

  return <div className="ap-page">
    <PeriodFilter period={period} />
    <Failure error={services.error} />
    <div className="ap-kpis">
      <Kpi label="Ganancia" value={money(total.margin)} note={total.pending ? `${total.pending} sin tarifa completa` : 'De lo entregado'} />
      <Kpi label="Cobrado" value={money(total.billed)} note="A las farmacias" />
      <Kpi label="Pagado" value={money(total.paid)} note="A domiciliarios" />
      <Kpi label="Pedidos" value={total.published} note="Publicados" />
      <Kpi label="Entregados" value={total.delivered} />
      <Kpi label="Cancelados" value={total.cancelled} />
      <Kpi label="Abiertos ahora" value={total.open} />
    </div>
    <Panel title="Ahora mismo"><div className="ap-kpis">
      <Kpi label="Ubicación" value={`${connected} de ${couriers.length}`} note="Domiciliarios conectados" onClick={() => onOpen('locations')} />
      <Kpi label="Tarifas" value={noPrice} note="Sin precio completo" onClick={() => onOpen('rates')} />
      <Kpi label="Usuarios" value={profiles.filter(item => item.active).length} note={`Activos de ${profiles.length}`} onClick={() => onOpen('users')} />
    </div></Panel>
    <Highlights title="Farmacias" items={stats.branches} unit="domicilios" />
    <Panel title="Detalle por farmacia"><Table headers={['Farmacia', 'Entregados', 'Publicados', 'Cancelados', 'Abiertos', 'Cobrado', 'Ganancia']} empty="Sin farmacias activas." rows={stats.branches.map(item => ({ key: item.name, cells: [<strong>{item.name}</strong>, <Bar value={item.count} max={maxBranch} />, item.published, item.cancelled, item.open, money(item.billed), <strong>{money(item.margin)}</strong>] }))} /></Panel>
    <Highlights title="Domiciliarios" items={stats.couriers} unit="domicilios" />
    <Panel title="Pedidos por domiciliario"><Table headers={['Domiciliario', 'Entregados', 'En curso', 'Pagado', 'Ganancia que dejó', 'Estado']} empty="Sin domiciliarios activos." rows={stats.couriers.map(item => ({ key: item.name, cells: [<strong>{item.name}</strong>, <Bar value={item.count} max={maxCourier} />, item.open, money(item.paid), <strong>{money(item.margin)}</strong>, item.available ? 'Conectado' : 'En pausa'] }))} /></Panel>
    <Panel title="Entregas por día"><DayBars from={from} to={to} days={stats.byDay} /></Panel>
    <div className="ap-two">
      <Panel title="Por tipo de servicio"><Table headers={['Tipo', 'Pedidos']} empty="Sin pedidos en este periodo." rows={[...stats.byType].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ key: type, cells: [SERVICE_LABELS[type] || type, <Bar value={count} max={maxType} />] }))} /></Panel>
      <Panel title="Por forma de pago"><Table headers={['Pago', 'Pedidos']} empty="Sin pedidos en este periodo." rows={[...stats.byPayment].sort((a, b) => b[1] - a[1]).map(([payment, count]) => ({ key: payment, cells: [PAYMENT_LABELS[payment] || payment, <Bar value={count} max={maxPayment} />] }))} /></Panel>
    </div>
  </div>;
}

function DayBars({ from, to, days }) {
  const list = [];
  for (let date = new Date(from + 'T12:00:00Z'); date.toISOString().slice(0, 10) <= to && list.length < 62; date.setUTCDate(date.getUTCDate() + 1)) list.push(date.toISOString().slice(0, 10));
  const max = Math.max(0, ...list.map(day => days.get(day) || 0));
  if (!max) return <Empty text="Sin entregas en este periodo." />;
  return <div className="ap-days" role="img" aria-label={list.map(day => `${dayLabel(day)}: ${days.get(day) || 0}`).join(', ')}>{list.map(day => {
    const count = days.get(day) || 0;
    return <div className="ap-day" key={day} title={`${dayLabel(day)}: ${count} entregas`}><span className="ap-day-track"><i style={{ height: count ? Math.max(4, count / max * 100) + '%' : 0 }} /></span>{list.length <= 14 && <small>{day.slice(8)}</small>}</div>;
  })}</div>;
}

function EarningsPage() {
  const period = usePeriod(1);
  const { from, to } = period;
  const { data, error } = useLive(() => companyEarnings(from, to), [from, to]);
  const rows = data || [];
  const add = (map, key, name, row) => {
    const item = map.get(key) || { name, services: 0, billed: 0, paid: 0, margin: 0 };
    ['services', 'billed', 'paid', 'margin'].forEach(field => { item[field] += Number(row[field]) || 0; });
    map.set(key, item);
  };
  const byCourier = new Map();
  const byDay = new Map();
  const total = { services: 0, billed: 0, paid: 0, margin: 0, pending: 0 };
  rows.forEach(row => {
    add(byCourier, row.courier_id || 'none', row.full_name, row);
    add(byDay, row.day, dayLabel(row.day), row);
    Object.keys(total).forEach(field => { total[field] += Number(row[field]) || 0; });
  });
  const table = map => [...map.entries()].map(([key, item]) => ({ key, cells: [<strong>{item.name}</strong>, item.services, money(item.billed), money(item.paid), <strong>{money(item.margin)}</strong>] }));
  return <div className="ap-page">
    <PeriodFilter period={period} />
    <Failure error={error} />
    <div className="ap-kpis">
      <Kpi label="Ganancia" value={money(total.margin)} note="Para la mensajería" />
      <Kpi label="Cobrado" value={money(total.billed)} note="A las farmacias" />
      <Kpi label="Pagado" value={money(total.paid)} note="A domiciliarios" />
      <Kpi label="Servicios" value={total.services} note={total.pending ? `${total.pending} sin tarifa completa` : 'Entregados'} />
    </div>
    <Panel title="Por domiciliario"><Table headers={['Domiciliario', 'Servicios', 'Cobrado', 'Pagado', 'Ganancia']} rows={table(byCourier)} empty="Sin entregas en este periodo." /></Panel>
    <Panel title="Por día"><Table headers={['Día', 'Servicios', 'Cobrado', 'Pagado', 'Ganancia']} rows={table(byDay)} empty="Sin entregas en este periodo." /></Panel>
  </div>;
}

function UsersPage({ profiles, branches }) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const query = search.trim().toLowerCase();
  const filtered = profiles.filter(user => !query || [user.full_name, user.username, user.phone, ROLE_LABELS[user.role], user.zone].filter(Boolean).join(' ').toLowerCase().includes(query));
  return <div className="ap-page">
    <div className="ap-toolbar">
      <input className="ap-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre, usuario, teléfono o rol" aria-label="Buscar usuario" />
      <button className="ap-btn ap-btn--primary" type="button" onClick={() => setCreating(value => !value)}><Icon name={creating ? 'close' : 'plus'} size={16} />{creating ? 'Cerrar' : 'Nuevo usuario'}</button>
    </div>
    {creating && <CreateUser branches={branches} onDone={() => setCreating(false)} />}
    <div className="ap-list">{filtered.map(user => <UserRow key={user.id} user={user} branches={branches} />)}{!filtered.length && <Empty text="No hay usuarios con esa búsqueda." />}</div>
  </div>;
}

function CreateUser({ branches, onDone }) {
  const { notify, refresh } = useContext(LiveContext);
  const [values, setValues] = useState({ username: '', full_name: '', password: '', phone: '', role: 'courier', branch_code: '', zone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key, value) => { setValues(current => ({ ...current, [key]: value })); setError(''); };
  async function submit(event) {
    event.preventDefault();
    if (!/^[a-z0-9._-]{3,32}$/.test(values.username)) return setError('El usuario debe tener de 3 a 32 letras, números, punto o guion.');
    if (!values.full_name.trim()) return setError('Escribe el nombre completo.');
    if (values.password.length < 8) return setError('La clave debe tener mínimo 8 caracteres.');
    if (values.role === 'pharmacy' && !values.branch_code) return setError('Elige la sede de esta farmacia.');
    setBusy(true);
    const { error: failure } = await createUser(values);
    setBusy(false);
    if (failure) return setError(failure.message);
    notify('success', `Usuario ${values.username} creado.`);
    refresh();
    onDone();
  }
  return <form className="ap-panel ap-form" onSubmit={submit}>
    <h2>Crear usuario</h2>
    <div className="ap-grid">
      <label>Usuario<input value={values.username} onChange={event => update('username', event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32))} autoCapitalize="none" autoComplete="off" /></label>
      <label>Nombre completo<input value={values.full_name} onChange={event => update('full_name', event.target.value)} /></label>
      <label>Clave<input type="password" value={values.password} onChange={event => update('password', event.target.value)} autoComplete="new-password" /></label>
      <label>Teléfono<input value={values.phone} onChange={event => update('phone', event.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" /></label>
      <label>Rol<select value={values.role} onChange={event => update('role', event.target.value)}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Sede<select value={values.branch_code} onChange={event => update('branch_code', event.target.value)}><option value="">Sin sede</option>{branches.filter(item => item.active).map(item => <option key={item.id} value={item.code}>{item.name}</option>)}</select></label>
      <label>Zona<input value={values.zone} onChange={event => update('zone', event.target.value)} /></label>
    </div>
    <Failure error={error} />
    <button className="ap-btn ap-btn--primary" type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</button>
  </form>;
}

function UserRow({ user, branches }) {
  const { notify, refresh } = useContext(LiveContext);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const branch = branches.find(item => item.id === user.branch_id);
  const [values, setValues] = useState({});
  const update = (key, value) => setValues(current => ({ ...current, [key]: value }));
  function startEdit() {
    setValues({ role: user.role, branchCode: branch?.code || '', zone: user.zone || '', vehicle: user.vehicle || '' });
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    const { error } = await updateProfile(user.id, values);
    setBusy(false);
    if (error) return notify('error', error.message || 'No se pudo actualizar.');
    notify('success', 'Usuario actualizado.');
    setEditing(false);
    refresh();
  }
  async function toggle() {
    setBusy(true);
    const { error } = await setProfileActive(user.id, !user.active);
    setBusy(false);
    if (error) return notify('error', error.message || 'No se pudo actualizar.');
    notify('success', `${user.full_name} quedó ${user.active ? 'sin acceso' : 'activo'}. Su historial se conserva.`);
    refresh();
  }
  return <article className={'ap-row' + (user.active ? '' : ' is-off')}>
    <div className="ap-row-main">
      <strong>{user.full_name || 'Sin nombre'}</strong>
      <span>{[ROLE_LABELS[user.role], user.username, user.phone, branch?.name, user.zone, user.vehicle].filter(Boolean).join(' · ')}</span>
      {editing && <div className="ap-grid ap-grid--edit">
        <label>Rol<select value={values.role} onChange={event => update('role', event.target.value)}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Sede<select value={values.branchCode} onChange={event => update('branchCode', event.target.value)}><option value="">Sin sede</option>{branches.map(item => <option key={item.id} value={item.code}>{item.name}</option>)}</select></label>
        <label>Zona<input value={values.zone} onChange={event => update('zone', event.target.value)} /></label>
        <label>Vehículo<input value={values.vehicle} onChange={event => update('vehicle', event.target.value)} /></label>
      </div>}
    </div>
    <div className="ap-row-actions">
      {editing ? <><button className="ap-btn ap-btn--primary" type="button" disabled={busy} onClick={save}>Guardar</button><button className="ap-btn" type="button" onClick={() => setEditing(false)}>Volver</button></> : <button className="ap-btn" type="button" onClick={startEdit}>Editar</button>}
      <button className={'ap-btn' + (user.active ? ' ap-btn--danger' : '')} type="button" disabled={busy} onClick={toggle}>{user.active ? 'Quitar acceso' : 'Activar'}</button>
    </div>
  </article>;
}

function RatesPage({ userId }) {
  const { data, error } = useLive(listRates, []);
  return <div className="ap-page">
    <Failure error={error} />
    <div className="ap-list">{(data || []).map(rate => <RateRow key={rate.id} rate={rate} userId={userId} />)}</div>
  </div>;
}

function RateRow({ rate, userId }) {
  const { notify, refresh } = useContext(LiveContext);
  const [general, setGeneral] = useState('');
  const [courier, setCourier] = useState('');
  const [busy, setBusy] = useState(false);
  // Si la cambian desde la APK o la central, se ve aquí sin recargar.
  useEffect(() => { setGeneral(rate.general_price_cop == null ? '' : String(rate.general_price_cop)); }, [rate.general_price_cop]);
  useEffect(() => { setCourier(rate.courier_price_cop == null ? '' : String(rate.courier_price_cop)); }, [rate.courier_price_cop]);
  const margin = general !== '' && courier !== '' ? Number(general) - Number(courier) : null;
  async function save() {
    if (general === '' || courier === '') return notify('error', 'Escribe los dos precios.');
    setBusy(true);
    const { error } = await updateRate(rate.id, Number(general), Number(courier), userId);
    setBusy(false);
    if (error) return notify('error', error.message || 'No se pudo guardar la tarifa.');
    notify('success', `Tarifa de ${rate.label} guardada.`);
    refresh();
  }
  return <article className="ap-row">
    <div className="ap-row-main"><strong>{rate.label}</strong><span>{PAYMENT_LABELS[rate.payment_method]}{margin != null ? ` · Ganancia ${money(margin)}` : ' · Sin precio completo'}</span></div>
    <div className="ap-rate-inputs">
      <label>Cobra a farmacia<input value={general} onChange={event => setGeneral(event.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label>
      <label>Paga a domiciliario<input value={courier} onChange={event => setCourier(event.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label>
      <button className="ap-btn ap-btn--primary" type="button" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </div>
  </article>;
}

function LocationsPage({ profiles }) {
  const couriers = profiles.filter(item => item.role === 'courier');
  return <div className="ap-page"><div className="ap-list">
    {couriers.map(courier => {
      const located = courier.last_lat != null && courier.last_lng != null;
      return <article className={'ap-row' + (courier.active ? '' : ' is-off')} key={courier.id}>
        <div className="ap-row-main"><strong>{courier.full_name}</strong><span>{!courier.active ? 'Sin acceso' : !courier.available ? 'En pausa · GPS apagado' : isReporting(courier) ? 'Conectado' : 'Sin señal del celular'}{courier.zone ? ` · ${courier.zone}` : ''}{located && courier.last_location_at ? ` · Actualizado ${timeLabel(courier.last_location_at)}` : ''}</span></div>
        <div className="ap-row-actions">{located ? <a className="ap-btn" href={`https://www.google.com/maps?q=${courier.last_lat},${courier.last_lng}`} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={15} />Abrir en Google Maps</a> : <span className="ap-muted">{courier.active && courier.available ? 'Esperando GPS del celular' : 'Sin ubicación'}</span>}</div>
      </article>;
    })}
    {!couriers.length && <Empty text="No hay domiciliarios." />}
  </div></div>;
}

function BranchesPage({ branches }) {
  return <div className="ap-page"><div className="ap-list">{branches.map(branch => <BranchRow key={branch.id} branch={branch} />)}</div></div>;
}

function BranchRow({ branch }) {
  const { notify, refresh } = useContext(LiveContext);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({});
  const update = (key, value) => setValues(current => ({ ...current, [key]: value }));
  function startEdit() {
    setValues({ address: branch.address || '', phone: branch.phone || '', latitude: branch.latitude ?? '', longitude: branch.longitude ?? '' });
    setEditing(true);
  }
  async function toggle() {
    setBusy(true);
    const { error } = await setBranchActive(branch.code, !branch.active);
    setBusy(false);
    if (error) return notify('error', error.message || 'No se pudo actualizar la sede.');
    notify('success', `${branch.name} quedó ${branch.active ? 'inactiva' : 'activa'}.`);
    refresh();
  }
  async function save() {
    if (!values.address.trim() || values.latitude === '' || values.longitude === '' || Number.isNaN(Number(values.latitude)) || Number.isNaN(Number(values.longitude))) return notify('error', 'Completa la dirección y las coordenadas.');
    setBusy(true);
    const { error } = await saveBranchLocation(branch.code, values);
    setBusy(false);
    if (error) return notify('error', error.message || 'No se pudo guardar la sede.');
    notify('success', `${branch.name} actualizada.`);
    setEditing(false);
    refresh();
  }
  return <article className={'ap-row' + (branch.active ? '' : ' is-off')}>
    <div className="ap-row-main">
      <strong>{branch.name}</strong>
      <span>{[branch.address, branch.neighborhood, branch.phone].filter(Boolean).join(' · ') || 'Sin dirección'}</span>
      {editing && <div className="ap-grid ap-grid--edit">
        <label>Dirección<input value={values.address} onChange={event => update('address', event.target.value)} /></label>
        <label>Teléfono<input value={values.phone} onChange={event => update('phone', event.target.value)} /></label>
        <label>Latitud<input value={values.latitude} onChange={event => update('latitude', event.target.value)} inputMode="decimal" /></label>
        <label>Longitud<input value={values.longitude} onChange={event => update('longitude', event.target.value)} inputMode="decimal" /></label>
      </div>}
    </div>
    <div className="ap-row-actions">
      {editing ? <><button className="ap-btn ap-btn--primary" type="button" disabled={busy} onClick={save}>Guardar</button><button className="ap-btn" type="button" onClick={() => setEditing(false)}>Volver</button></> : <button className="ap-btn" type="button" onClick={startEdit}>Editar</button>}
      <button className={'ap-btn' + (branch.active ? ' ap-btn--danger' : '')} type="button" disabled={busy} onClick={toggle}>{branch.active ? 'Desactivar' : 'Activar'}</button>
    </div>
  </article>;
}

function PayrollPage() {
  const period = usePeriod(7);
  const { from, to } = period;
  const { data, error } = useLive(() => payrollReport(from, to), [from, to]);
  const rows = data || [];
  return <div className="ap-page">
    <PeriodFilter period={period} />
    <Failure error={error} />
    <div className="ap-kpis">
      <Kpi label="Total generado" value={money(rows.reduce((sum, row) => sum + Number(row.fee_total || 0), 0))} />
      <Kpi label="Pendiente de pago" value={money(rows.reduce((sum, row) => sum + Number(row.pending_total || 0), 0))} />
    </div>
    <div className="ap-list">
      {rows.map(row => <PayrollRow key={row.courier_id} row={row} from={from} to={to} />)}
      {data && !rows.length && <Empty text="Sin entregas en este periodo." />}
    </div>
  </div>;
}

function PayrollRow({ row, from, to }) {
  const { notify, refresh } = useContext(LiveContext);
  const [open, setOpen] = useState(false);
  const days = useLive(() => (open ? payrollDays(row.courier_id, from, to) : { data: [] }), [open, from, to, row.courier_id]);
  async function toggle(day) {
    const { error } = await setPayrollDayPaid(row.courier_id, day.day, !day.paid);
    if (error) return notify('error', error.message || 'No se pudo actualizar el pago.');
    notify('success', `${dayLabel(day.day)} ${day.paid ? 'quedó pendiente' : 'quedó pagado'}.`);
    refresh();
  }
  return <article className="ap-row ap-row--stack">
    <div className="ap-row-top">
      <div className="ap-row-main"><strong>{row.full_name}</strong><span>{row.services} servicios · Generó {money(row.fee_total)} · Pendiente {money(row.pending_total)}</span></div>
      <button className="ap-btn" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar días' : 'Ver días'}</button>
    </div>
    {open && <div className="ap-list">{(days.data || []).map(day => <div className="ap-pay-day" key={day.day}><span>{dayLabel(day.day)} · {day.services} servicios · {money(day.fee_total)}</span><button className={'ap-btn' + (day.paid ? '' : ' ap-btn--primary')} type="button" onClick={() => toggle(day)}>{day.paid ? 'Pagado · deshacer' : 'Marcar pagado'}</button></div>)}{days.data && !days.data.length && <Empty text="Sin días con entregas." />}</div>}
  </article>;
}

function BillingPage() {
  const period = usePeriod(7);
  const { from, to } = period;
  const { data, error } = useLive(() => billingReport(from, to), [from, to]);
  const rows = data || [];
  return <div className="ap-page">
    <PeriodFilter period={period} />
    <Failure error={error} />
    <div className="ap-kpis"><Kpi label="Total a cobrar" value={money(rows.reduce((sum, row) => sum + Number(row.fee_total || 0), 0))} note={`${rows.length} sedes con entregas`} /></div>
    <Panel title="Por sede"><Table headers={['Zona', 'Sede', 'Servicios', 'Compras', 'Tarifas', 'Sin tarifa']} rows={rows.map(row => ({ key: row.branch_code, cells: [row.zone_name || '—', <strong>{row.branch_name}</strong>, row.services, money(row.medicine_total), money(row.fee_total), row.fees_pending || 0] }))} empty="Sin entregas en este periodo." /></Panel>
  </div>;
}
