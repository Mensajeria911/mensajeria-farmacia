import { supabase } from './supabase.js';
import { usernameToAuthEmail } from './auth.js';

const PAGE_SIZE = 1000;
const BOGOTA_OFFSET = '-05:00';

export function localDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export function dayOf(value) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function nextDay(day) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function listProfiles() {
  return supabase.from('profiles').select('id, username, full_name, phone, role, branch_id, zone, vehicle, active, available, last_lat, last_lng, last_location_at').order('full_name');
}

export function listAllBranches() {
  return supabase.from('branches').select('id, code, name, address, neighborhood, phone, latitude, longitude, active, location_confirmed').order('code');
}

export function listRates() {
  return supabase.from('service_rates').select('id, service_type, payment_method, label, general_price_cop, courier_price_cop, active').eq('active', true).order('label');
}

export function listZones() {
  return supabase.from('zones').select('name').order('name');
}

// Lo publicado o entregado en el periodo, en hora de Colombia.
export async function listPeriodServices(from, to) {
  const start = `${from}T00:00:00${BOGOTA_OFFSET}`;
  const end = `${nextDay(to)}T00:00:00${BOGOTA_OFFSET}`;
  const rows = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase.from('visible_services')
      .select('id, status, branch_id, service_type, payment_method, assigned_courier_id, general_fee_cop, courier_fee_cop, fee_cop, created_at, delivered_at')
      .or(`and(created_at.gte.${start},created_at.lt.${end}),and(delivered_at.gte.${start},delivered_at.lt.${end})`)
      .order('created_at')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export function companyEarnings(from, to) {
  return supabase.rpc('company_earnings', { p_from: from, p_to: to });
}

export function billingReport(from, to) {
  return supabase.rpc('billing_report', { p_from: from, p_to: to });
}

export function payrollReport(from, to) {
  return supabase.rpc('payroll_report', { p_from: from, p_to: to });
}

export function payrollDays(courierId, from, to) {
  return supabase.rpc('payroll_days', { p_courier_id: courierId, p_from: from, p_to: to });
}

export function setPayrollDayPaid(courierId, day, paid) {
  return supabase.rpc('set_payroll_day_paid', { p_courier_id: courierId, p_day: day, p_paid: paid });
}

export function updateRate(id, generalPrice, courierPrice, userId) {
  return supabase.from('service_rates').update({
    general_price_cop: generalPrice,
    courier_price_cop: courierPrice,
    general_price_confirmed: true,
    courier_price_confirmed: true,
    price_cop: courierPrice,
    price_confirmed: true,
    updated_by: userId
  }).eq('id', id);
}

export async function createUser(values) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { ...values, email: usernameToAuthEmail(values.username) }
  });
  if (!error) return { data, error: null };
  // La función explica el problema en el cuerpo de la respuesta.
  const detail = await error.context?.json?.().catch(() => null);
  return { data: null, error: new Error(detail?.error || 'No se pudo crear la cuenta.') };
}

export function setProfileActive(id, active) {
  return supabase.rpc('admin_set_profile_active', { p_user_id: id, p_active: active }).single();
}

export function updateProfile(id, values) {
  return supabase.rpc('admin_update_profile', {
    p_user_id: id,
    p_role: values.role,
    p_branch_code: values.branchCode || null,
    p_zone: values.zone || null,
    p_vehicle: values.vehicle || null
  }).single();
}

export function setBranchActive(code, active) {
  return supabase.rpc('admin_set_branch_active', { p_branch_code: code, p_active: active }).single();
}

export function saveBranchLocation(code, values) {
  return supabase.rpc('admin_set_branch_location', {
    p_branch_code: code,
    p_address: values.address.trim(),
    p_lat: Number(values.latitude),
    p_lng: Number(values.longitude),
    p_phone: values.phone.trim() || null
  });
}

export function subscribeToAdmin(onChange, onStatus) {
  let connected = false;
  const channel = supabase.channel('admin-portal');
  ['delivery_services', 'service_rates', 'profiles', 'branches', 'zones', 'payroll_paid_days'].forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  });
  channel.subscribe(status => {
    onStatus(status === 'SUBSCRIBED');
    if (status !== 'SUBSCRIBED') return;
    if (connected) onChange();
    connected = true;
  });
  return () => { void supabase.removeChannel(channel); };
}
