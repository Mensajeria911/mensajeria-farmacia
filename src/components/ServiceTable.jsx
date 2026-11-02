import { useMemo, useState } from 'react';
import { Icon } from './Icon.jsx';
import { SERVICE_LABELS, buyItemsOf, crossItemsOf, crossLine, returnsToPharmacy, usesPayment } from '../lib/operations.js';

const STATUS_LABELS = { unassigned: 'Sin asignar', assigned: 'Asignado', enroute: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado' };
const ROUTE_STATUS = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Listo', skipped: 'Omitido' };

function money(value) {
  return value == null ? 'Por confirmar' : '$' + Number(value).toLocaleString('es-CO');
}

function lineCount(value) {
  return String(value || '').split('\n').map(item => item.trim()).filter(Boolean).length;
}

function paymentLabel(value) {
  return value === 'card' ? 'Datáfono' : value === 'cash' ? 'Efectivo' : 'Sin pago al cliente';
}

function routePlan(service) {
  return Array.isArray(service.route_plan) ? service.route_plan.filter(step => step && step.title) : [];
}

export function ServiceTable({ services, couriers = [], loading, error, onRefresh, title = 'Pedidos de la sede', onUpdatePayment, onUpdateService, onCancel }) {
  const [filter, setFilter] = useState('all');
  const [savingPaymentId, setSavingPaymentId] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const visible = useMemo(() => filter === 'all' ? services : services.filter(item => item.status === filter), [filter, services]);
  const filters = [['all', 'Todos'], ['unassigned', 'Sin asignar'], ['assigned', 'Asignados'], ['enroute', 'En camino'], ['delivered', 'Entregados'], ['cancelled', 'Cancelados']];

  async function changePayment(service, paymentMethod) {
    if (paymentMethod === service.payment_method) return;
    setSavingPaymentId(service.id);
    if (onUpdateService) await onUpdateService(service, { payment_method: paymentMethod });
    else if (onUpdatePayment) await onUpdatePayment(service, paymentMethod);
    setSavingPaymentId(null);
  }

  async function saveEdit(service, patch) {
    if (!onUpdateService) return false;
    setSavingEditId(service.id);
    const result = await onUpdateService(service, patch);
    setSavingEditId(null);
    return result;
  }

  return (
    <section className="content-page orders-page">
      <div className="section-topline"><div className="orders-title"><p className="section-kicker">Seguimiento</p><h2>{title}</h2><p>Consulta los servicios publicados por esta sede y el estado que confirma la central.</p></div><span className="orders-updated"><span className="status-dot status-dot--green" />Actualización en tiempo real</span><button className="button button--secondary" type="button" onClick={onRefresh} disabled={loading}><Icon name="refresh" size={16} />{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      <div className="status-filters" role="tablist" aria-label="Filtrar servicios">{filters.map(([key, label]) => <button key={key} className="filter-chip" type="button" role="tab" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span className="filter-chip-count">{key === 'all' ? services.length : services.filter(item => item.status === key).length}</span></button>)}</div>
      {error && <div className="form-error" role="alert"><Icon name="close" size={16} />{error}</div>}
      <div className="orders-panel"><table className="orders-table"><thead><tr><th>Servicio</th><th>Cliente / destino</th><th>Estado</th><th>Tarifa y pago</th><th>Publicado</th></tr></thead><tbody>{visible.map(service => {
        const pharmacyFee = service.general_fee_cop ?? service.fee_cop;
        const feeConfirmed = service.general_fee_confirmed ?? service.fee_confirmed;
        const purchases = lineCount(service.buy_product);
        const crosses = Array.isArray(service.cross_codes) ? service.cross_codes.filter(Boolean).length : 0;
        const editable = !['delivered', 'cancelled'].includes(service.status) && Boolean(onUpdateService);
        const paymentEditable = ['unassigned', 'assigned', 'enroute'].includes(service.status) && service.payment_method !== 'none';
        return <tr key={service.id}>
          <td data-label="Servicio"><strong className="order-code">{service.code}</strong><span className="order-service"><i className="svc-dot" />{SERVICE_LABELS[service.service_type] || service.service_type}</span>{(purchases || crosses) > 0 && <small className="order-composition">{purchases ? `${purchases} compra${purchases === 1 ? '' : 's'}` : ''}{purchases && crosses ? ' · ' : ''}{crosses ? `${crosses} cruce${crosses === 1 ? '' : 's'}` : ''}</small>}</td>
          <td data-label="Cliente / destino"><span className="order-address"><strong>{service.customer_name || 'Cliente'}</strong><span>{service.delivery_address || 'Dirección pendiente'}</span>{service.customer_phone && <small>{service.customer_phone}</small>}</span><RouteProgress service={service} />{editable && <ServiceEditor service={service} busy={savingEditId === service.id} onSave={patch => saveEdit(service, patch)} />}</td>
          <td data-label="Estado"><span className={'status-badge status-badge--' + service.status}><i />{STATUS_LABELS[service.status] || service.status}</span>{service.assigned_courier_id && <span className="order-courier"><Icon name="users" size={13} />{couriers.find(item => item.id === service.assigned_courier_id)?.full_name || 'Domiciliario asignado'}</span>}{service.status === 'unassigned' && onCancel && <CancelOrder service={service} onCancel={onCancel} />}</td>
          <td data-label="Tarifa y pago"><strong>{money(pharmacyFee)}</strong>{!feeConfirmed && <span>Pendiente de confirmar</span>}<span className="order-payment-label">{paymentLabel(service.payment_method)}</span>{paymentEditable && <select className="order-payment-select" value={service.payment_method} onChange={event => changePayment(service, event.target.value)} disabled={savingPaymentId === service.id} aria-label={`Cambiar forma de pago de ${service.code}`}><option value="cash">Efectivo</option><option value="card">Datáfono</option></select>}</td>
          <td data-label="Publicado"><span className="order-time">{new Date(service.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}<small>{new Date(service.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</small></span></td>
        </tr>;
      })}</tbody></table>{!loading && !visible.length && <div className="orders-empty"><span className="table-empty-icon"><Icon name="package" size={23} /></span><strong>No hay servicios en este filtro</strong><span>Cuando publiques uno, aparecerá aquí y la central lo recibirá.</span></div>}</div>
      <p className="orders-edit-note"><Icon name="check" size={13} />Puedes corregir todo mientras el servicio no esté entregado. Si ya está asignado, el domiciliario recibirá el cambio.</p>
    </section>
  );
}

function CancelOrder({ service, onCancel }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  if (!asking) return <button className="order-cancel" type="button" onClick={() => setAsking(true)}>Cancelar</button>;
  return <div className="order-cancel-ask"><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Motivo (opcional)" aria-label={`Motivo para cancelar ${service.code}`} /><button className="order-cancel" type="button" onClick={() => onCancel(service, reason.trim())}>Confirmar</button><button className="order-cancel order-cancel--back" type="button" onClick={() => setAsking(false)}>No cancelar</button></div>;
}

function RouteProgress({ service }) {
  const plan = routePlan(service);
  if (!plan.length) return null;
  const done = plan.filter(step => step.status === 'completed').length;
  return <div className="order-route" aria-label={`Ruta: ${done} de ${plan.length} pasos listos`}><div className="order-route-head"><span>Ruta operativa</span><strong>{done}/{plan.length} listos</strong></div>{plan.map(step => <div className={'order-route-step is-' + (step.status || 'pending')} key={step.key}><i /> <span>{step.title}</span><small>{ROUTE_STATUS[step.status] || ROUTE_STATUS.pending}</small></div>)}</div>;
}

function ServiceEditor({ service, busy, onSave }) {
  const [values, setValues] = useState({
    service_type: service.service_type,
    customer_name: service.customer_name || '',
    customer_phone: service.customer_phone || '',
    delivery_address: service.delivery_address || '',
    neighborhood: service.neighborhood || '',
    invoice_code: service.invoice_code || '',
    medicine_value_cop: service.medicine_value_cop || '',
    buys: buyItemsOf(service.buy_product, service.buy_place).map(item => `${item.product} | ${item.place}`).join('\n'),
    crosses: crossItemsOf(service.cross_codes).map(item => `${item.branchCode} | ${item.product} | ${item.code}`).join('\n'),
    return_to_pharmacy: returnsToPharmacy(service),
    note: service.note || ''
  });
  const update = (key, value) => setValues(current => ({ ...current, [key]: value }));
  const lines = value => value.split('\n').map(line => line.split('|').map(part => part.trim())).filter(parts => parts.some(Boolean));
  async function submit(event) {
    event.preventDefault();
    const { buys, crosses, ...fields } = values;
    const buyLines = lines(buys);
    const crossLines = lines(crosses);
    const payment = usesPayment(values.service_type) ? (service.payment_method === 'none' ? 'cash' : service.payment_method) : 'none';
    await onSave({
      ...fields,
      customer_phone: values.customer_phone.replace(/\D/g, '').slice(0, 10),
      invoice_code: values.invoice_code.toUpperCase(),
      medicine_value_cop: Number(values.medicine_value_cop) || 0,
      buy_product: buyLines.map((parts, index) => `${index + 1}. ${parts[0] || ''}`).join('\n'),
      buy_place: buyLines.map((parts, index) => `${index + 1}. ${parts[1] || ''}`).join('\n'),
      cross_branch_code: (crossLines[0]?.[0] || '').toUpperCase().replace(/FARMA\s*NORTE|FN/g, '').replace(/[^A-Z0-9]/g, ''),
      cross_codes: crossLines.map((parts, index) => crossLine({ branchCode: parts[0], product: parts[1], code: parts[2] }, index)),
      ...(values.service_type !== service.service_type ? { payment_method: payment } : {})
    });
  }
  return <details className="order-edit"><summary><Icon name="edit" size={13} />Editar servicio</summary><form onSubmit={submit}><label className="order-edit-full">Tipo de servicio<select value={values.service_type} onChange={event => update('service_type', event.target.value)}>{Object.entries(SERVICE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Nombre<input value={values.customer_name} onChange={event => update('customer_name', event.target.value)} /></label><label>Celular<input value={values.customer_phone} onChange={event => update('customer_phone', event.target.value)} inputMode="numeric" /></label><label className="order-edit-full">Dirección<input value={values.delivery_address} onChange={event => update('delivery_address', event.target.value)} /></label><label>Barrio<input value={values.neighborhood} onChange={event => update('neighborhood', event.target.value)} /></label><label>Factura<input value={values.invoice_code} onChange={event => update('invoice_code', event.target.value)} /></label><label className="order-edit-full">Compras, una por línea: producto | lugar<textarea rows="2" value={values.buys} onChange={event => update('buys', event.target.value)} /></label><label>Valor de compras<input value={values.medicine_value_cop} onChange={event => update('medicine_value_cop', event.target.value.replace(/\D/g, ''))} inputMode="numeric" /></label><label className="order-edit-full">Cruces, uno por línea: farmacia | producto | código<textarea rows="2" value={values.crosses} onChange={event => update('crosses', event.target.value)} /></label>{values.service_type.startsWith('home') && values.service_type !== 'home' && <label className="order-edit-full order-edit-check"><input type="checkbox" checked={values.return_to_pharmacy} onChange={event => update('return_to_pharmacy', event.target.checked)} />Debe volver a la farmacia por más productos</label>}<label className="order-edit-full">Nota<input value={values.note} onChange={event => update('note', event.target.value)} /></label><button className="button button--primary button--small" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></form></details>;
}
