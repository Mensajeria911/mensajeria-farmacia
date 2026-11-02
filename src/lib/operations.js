import { supabase } from './supabase.js';

export const SERVICE_OPTIONS = [
  { value: 'home', label: 'Domicilio', description: 'Llevar un pedido al cliente. Puedes cambiar a tarjeta o QR.' },
  { value: 'buy', label: 'Compra', description: 'Buscar un producto en una farmacia externa.' },
  { value: 'cross', label: 'Cruce', description: 'Pasar productos entre dos sedes farmanorte.' },
  { value: 'home_buy', label: 'Domicilio con compra', description: 'Comprar el producto y llevarlo al cliente.' },
  { value: 'home_cross', label: 'Domicilio con cruce', description: 'Recoger productos en otra sede y entregar.' },
  { value: 'home_buy_cross', label: 'Domicilio con compra y cruce', description: 'Combinar compra externa, cruce y entrega.' },
  { value: 'change', label: 'Cambio de menuda', description: 'Llevar sencillo a la sede para entregar vueltos.' }
];

export const SERVICE_LABELS = Object.fromEntries(SERVICE_OPTIONS.map(item => [item.value, item.label]));

export function usesPayment(serviceType) {
  return ['home', 'home_buy', 'home_cross', 'home_buy_cross'].includes(serviceType);
}

export function hasBuy(serviceType) {
  return ['buy', 'home_buy', 'home_buy_cross'].includes(serviceType);
}

export function hasCross(serviceType) {
  return ['cross', 'home_cross', 'home_buy_cross'].includes(serviceType);
}

export function rateFor(rates, serviceType, paymentMethod) {
  return rates.find(rate => rate.service_type === serviceType && rate.payment_method === paymentMethod) || null;
}

export async function getBranches() {
  if (!supabase) return { data: [], error: new Error('Supabase no está configurado.') };
  return supabase.from('branches').select('id, code, name, address, neighborhood, active').eq('active', true).order('code');
}

export async function getRates() {
  if (!supabase) return { data: [], error: new Error('Supabase no está configurado.') };
  return supabase.rpc('pharmacy_rates');
}

export async function getActiveCouriers() {
  if (!supabase) return { data: [], error: null };
  const [couriers, workload] = await Promise.all([supabase.rpc('list_active_couriers'), supabase.rpc('courier_workload')]);
  if (couriers.error || workload.error) return couriers;
  const byCourier = new Map(workload.data.map(item => [item.courier_id, item]));
  return { data: couriers.data.map(item => ({ ...item, load: byCourier.get(item.id) })), error: null };
}

export async function listBranchServices(branchId) {
  if (!supabase) return { data: [], error: new Error('Supabase no está configurado.') };
  return supabase.from('visible_services').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(500);
}

export function subscribeToBranchServices(branchId, onServices, onReference) {
  if (!supabase) return () => {};
  let connected = false;
  const channel = supabase.channel('pharmacy-services-' + branchId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_services', filter: 'branch_id=eq.' + branchId }, onServices);
  ['profiles', 'branches', 'service_rates'].forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onReference);
  });
  // Si se cayó la conexión, al volver se recupera lo que pasó mientras tanto.
  channel.subscribe(status => {
    if (status !== 'SUBSCRIBED') return;
    if (connected) { onServices(); onReference(); }
    connected = true;
  });
  return () => { void supabase.removeChannel(channel); };
}

export function normalizeBranchCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/FARMA\s*NORTE|FN/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function buildRoutePlan(form, branch) {
  const branchCode = normalizeBranchCode(branch?.code);
  const plan = [];
  const buyItems = (form.buyItems || []).filter(item => item.product || item.place || item.value);
  const crossItems = (form.crossItems || []).filter(item => item.branchCode || item.code || item.product);
  const add = (key, kind, title, detail, extra = {}) => plan.push({ key, kind, title, detail, status: 'pending', ...extra });

  if (form.serviceType === 'change') {
    add('change-pickup', 'pickup', `Recoger sencillo en FN ${branchCode}`, branch?.address || 'Pregunta en caja.');
    add('change-delivery', 'deliver', `Entregar sencillo en FN ${branchCode}`, form.changeAmountCop ? `Valor: $${Number(form.changeAmountCop).toLocaleString('es-CO')}` : 'Confirma el valor en caja.');
    return plan;
  }

  crossItems.forEach((item, index) => {
    const source = normalizeBranchCode(item.branchCode);
    add(
      `cross-${index + 1}`,
      'cross',
      `Recoger cruce en FN ${source}`,
      [item.product, item.code ? `Código: ${item.code}` : ''].filter(Boolean).join(' · ') || 'Pregunta en la sede qué debes recoger.',
      { source_branch_code: source, destination_branch_code: branchCode, reference: item.code || null, product: item.product || null },
    );
  });

  buyItems.forEach((item, index) => {
    const product = String(item.product || '').trim() || `compra ${index + 1}`;
    const place = String(item.place || '').trim() || 'sede por confirmar';
    add(`buy-${index + 1}`, 'buy', `Comprar: ${product}`, `En ${place}. Guarda la factura.`, { place, product });
  });

  // Compra o cruce solos terminan en la sede que publicó; no se pasa antes por ella.
  if (form.serviceType === 'buy') {
    add('return-origin', 'deliver', `Regresar con la compra a FN ${branchCode}`, branch?.address || 'Entrega la compra en la sede que publicó el servicio.');
  }
  if (form.serviceType === 'cross') {
    add('cross-return', 'deliver', `Entregar los cruces en FN ${branchCode}`, branch?.address || 'La sede que publicó el servicio es el destino del cruce.');
  }
  // Con compra o cruce, solo se vuelve a la farmacia si ella lo indicó.
  if (form.serviceType === 'home') {
    add('origin', 'pickup', `Recoger pedido en FN ${branchCode}`, branch?.address || 'Sede que publicó el servicio.', { branch_code: branchCode });
  } else if (usesPayment(form.serviceType) && form.returnToPharmacy) {
    add('origin', 'pickup', `Volver a FN ${branchCode} por más productos`, branch?.address || 'Sede que publicó el servicio.', { branch_code: branchCode });
  }
  if (usesPayment(form.serviceType)) {
    add('delivery', 'deliver', `Entregar a ${form.customerName || 'el cliente'}`, [form.deliveryAddress, form.customerPhone, form.paymentMethod === 'card' ? 'Cobrar con datáfono.' : 'Cobrar en efectivo.'].filter(Boolean).join(' · '));
  }
  return plan;
}

const withoutNumber = line => line.replace(/^\d+\.\s*/, '').trim();
const textLines = value => String(value || '').split('\n').map(withoutNumber).filter(Boolean);

export function buyItemsOf(buyProduct, buyPlace) {
  const places = textLines(buyPlace);
  return textLines(buyProduct).map((product, index) => ({ product, place: places[index] || '' }));
}

// Se guarda como texto legible, porque así lo muestra la app del domiciliario.
export function crossLine(item, index) {
  const parts = [
    normalizeBranchCode(item.branchCode),
    item.code ? `Código: ${String(item.code).trim()}` : '',
    item.product ? `Producto: ${String(item.product).trim()}` : ''
  ];
  return `${index + 1}. ${parts.filter(Boolean).join(' · ')}`.toUpperCase();
}

export function crossItemsOf(crossCodes) {
  return (crossCodes || []).map(item => {
    const [branchCode, ...rest] = withoutNumber(item).split('·').map(part => part.trim());
    const parsed = { branchCode, code: '', product: '' };
    rest.filter(Boolean).forEach(part => {
      if (/^producto:/i.test(part)) parsed.product = part.replace(/^producto:\s*/i, '');
      else parsed.code = part.replace(/^c[oó]digo:\s*/i, '');
    });
    return parsed;
  });
}

export function returnsToPharmacy(service) {
  return Array.isArray(service?.route_plan) && service.route_plan.some(step => step?.key === 'origin');
}

// Si cambian el tipo, las compras, los cruces o la vuelta a la farmacia se arma la ruta otra vez; los
// pasos que siguen iguales conservan lo que el domiciliario ya marcó.
function rebuiltRoute(service, patch, branch) {
  const type = patch.service_type ?? service.service_type;
  const buyProduct = patch.buy_product ?? service.buy_product;
  const crossCodes = patch.cross_codes ?? service.cross_codes;
  const sameCrosses = (crossCodes || []).join('|') === (service.cross_codes || []).join('|');
  const previousReturn = returnsToPharmacy(service);
  const nextReturn = patch.return_to_pharmacy ?? previousReturn;
  if (nextReturn === previousReturn && type === service.service_type && (buyProduct || '') === (service.buy_product || '') && (patch.buy_place ?? service.buy_place ?? '') === (service.buy_place || '') && sameCrosses) return null;
  const previous = Array.isArray(service.route_plan) ? service.route_plan : [];
  return buildRoutePlan({
    serviceType: type,
    buyItems: buyItemsOf(buyProduct, patch.buy_place ?? service.buy_place),
    crossItems: crossItemsOf(crossCodes),
    customerName: patch.customer_name ?? service.customer_name,
    customerPhone: patch.customer_phone ?? service.customer_phone,
    deliveryAddress: patch.delivery_address ?? service.delivery_address,
    paymentMethod: patch.payment_method ?? service.payment_method,
    changeAmountCop: service.change_amount_cop,
    returnToPharmacy: nextReturn
  }, branch).map(step => {
    const same = previous.find(item => item.key === step.key && (item.title === step.title || step.key === 'delivery'));
    return same ? { ...same, title: step.title, detail: step.detail } : step;
  });
}

export function routePlanAfterEdit(service, patch, branch) {
  const rebuilt = branch ? rebuiltRoute(service, patch, branch) : null;
  if (rebuilt) return rebuilt;
  if (!Array.isArray(service?.route_plan) || !service.route_plan.length) return undefined;
  const payment = patch.payment_method ?? service.payment_method;
  const customer = patch.customer_name ?? service.customer_name ?? 'el cliente';
  const address = patch.delivery_address ?? service.delivery_address ?? 'la dirección del cliente';
  const phone = patch.customer_phone ?? service.customer_phone;
  return service.route_plan.map(step => step.key === 'delivery'
    ? {
      ...step,
      title: `Entregar a ${customer}`,
      detail: [address, phone, payment === 'card' ? 'Cobrar con datáfono.' : payment === 'cash' ? 'Cobrar en efectivo.' : null].filter(Boolean).join(' · ')
    }
    : step
  );
}

export async function createPharmacyService(form) {
  if (!supabase) return { data: null, error: new Error('Supabase no está configurado.') };
  const isStandalonePickup = form.serviceType === 'buy' || form.serviceType === 'cross';
  const paymentMethod = usesPayment(form.serviceType) ? form.paymentMethod : 'none';
  const buyItems = (form.buyItems || []).filter(item => item.product || item.place || item.value);
  const crossItems = (form.crossItems || []).filter(item => item.branchCode || item.code || item.product);
  const buyProduct = buyItems.map((item, index) => `${index + 1}. ${String(item.product || '').trim()}`).join('\n');
  const buyPlace = buyItems.map((item, index) => `${index + 1}. ${String(item.place || '').trim()}`).join('\n');
  const crossCodes = crossItems.map(crossLine);
  const medicineValueCop = buyItems.reduce((total, item) => total + (Number(item.value) || 0), 0);
  const crossBranchCode = String(crossItems[0]?.branchCode || '')
    .trim()
    .toUpperCase()
    .replace(/FARMA\s*NORTE|FN/g, '')
    .replace(/[^A-Z0-9]/g, '');
  const result = await supabase.rpc('create_delivery_service', {
    p_branch_id: form.branchId,
    p_service_type: form.serviceType,
    p_customer_name: isStandalonePickup ? null : (form.customerName || 'Cliente'),
    p_customer_phone: isStandalonePickup ? null : (form.customerPhone || null),
    p_delivery_address: isStandalonePickup ? null : (form.deliveryAddress || null),
    p_neighborhood: isStandalonePickup ? null : (form.neighborhood || null),
    p_destination_lat: isStandalonePickup ? null : (form.destinationLat || null),
    p_destination_lng: isStandalonePickup ? null : (form.destinationLng || null),
    p_payment_method: paymentMethod,
    p_change_amount_cop: form.changeAmountCop ? Number(form.changeAmountCop) : null,
    // La base actual conserva estos campos como texto/array. Cada elemento
    // queda numerado para que un domicilio pueda llevar varias compras y cruces
    // sin perder el detalle al verlo desde el APK o la PWA.
    p_buy_product: buyProduct || null,
    p_buy_place: buyPlace || null,
    p_cross_branch_code: crossBranchCode || null,
    p_note: form.note || null,
    p_invoice_code: isStandalonePickup ? null : (form.invoiceCode || null),
    p_medicine_value_cop: medicineValueCop || null,
    p_cross_codes: crossCodes
  }).single();
  if (result.error || !result.data) return result;

  // La ruta se guarda después de crear el servicio porque el consecutivo y el
  // id solo los conoce Supabase. Si la migración todavía no se aplicó, no se
  // bloquea la publicación: se devuelve el servicio y se deja el aviso local.
  const workflow = await updateDeliveryWorkflow(result.data.id, {
    route_plan: buildRoutePlan(form, { code: form.branchCode || result.data.branch_code, address: form.branchAddress }),
    suggested_courier_id: form.suggestedCourierId || null
  });
  return {
    data: workflow.data || result.data,
    error: null,
    warning: workflow.error || null
  };
}

export async function updateServicePayment(serviceId, paymentMethod, routePlan) {
  const next = await updateDeliveryWorkflow(serviceId, {
    payment_method: paymentMethod,
    ...(routePlan ? { route_plan: routePlan } : {})
  });
  if (!next.error || !/function|could not find|does not exist/i.test(next.error.message || '')) return next;
  // Compatibilidad mientras la migración 016 todavía no está aplicada.
  return supabase.rpc('update_delivery_payment', {
    p_service_id: serviceId,
    p_payment_method: paymentMethod
  }).single();
}

export async function cancelService(serviceId, reason) {
  if (!supabase) return { data: null, error: new Error('Supabase no está configurado.') };
  return supabase.rpc('cancel_delivery_service', { p_service_id: serviceId, p_reason: reason || null }).single();
}

export async function updateDeliveryWorkflow(serviceId, patch) {
  if (!supabase) return { data: null, error: new Error('Supabase no está configurado.') };
  return supabase.rpc('update_delivery_workflow', {
    p_service_id: serviceId,
    p_patch: patch
  }).single();
}

export async function sendServiceUpdatePush(serviceId) {
  if (!supabase) return { data: null, error: new Error('Supabase no está configurado.') };
  return supabase.functions.invoke('send-push-notification', {
    body: { service_id: serviceId, event_type: 'service_updated' }
  });
}
