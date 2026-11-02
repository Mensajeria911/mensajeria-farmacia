import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { SERVICE_OPTIONS, hasBuy, hasCross, normalizeBranchCode, rateFor, usesPayment } from '../lib/operations.js';

const INITIAL_FORM = {
  serviceType: 'home',
  paymentMethod: 'cash',
  customerName: '',
  customerPhone: '',
  deliveryAddress: '',
  buyItems: [{ product: '', place: '', value: '' }],
  crossItems: [{ branchCode: '', product: '', code: '' }],
  returnToPharmacy: false,
  invoiceCode: '',
  changeAmountCop: '',
  suggestedCourierId: ''
};

const SERVICE_ICONS = {
  home: 'package',
  buy: 'wallet',
  cross: 'grid',
  home_buy: 'package',
  home_cross: 'package',
  home_buy_cross: 'package',
  change: 'wallet'
};

function courierLoad(courier) {
  const load = courier.load;
  if (!load?.open_services) return 'sin servicios';
  const minutes = load.estimated_minutes;
  const time = minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return `${load.open_services} servicio${load.open_services === 1 ? '' : 's'} · ${time}`;
}

export function ServiceForm({ branch, branches = [], rates, couriers = [], onSubmit, onOpenOrders }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const selected = SERVICE_OPTIONS.find(item => item.value === form.serviceType);
  const rate = rateFor(rates, form.serviceType, usesPayment(form.serviceType) ? form.paymentMethod : 'none');
  const requiresBuy = hasBuy(form.serviceType);
  const requiresCross = hasCross(form.serviceType);
  const isStandalonePickup = form.serviceType === 'buy' || form.serviceType === 'cross';
  const requiresDeliveryData = usesPayment(form.serviceType) || form.serviceType === 'change';
  const requiresInvoice = !isStandalonePickup && form.serviceType !== 'change';
  const requiresCustomerData = usesPayment(form.serviceType);
  const requiresCustomerPhone = requiresCustomerData;
  const hasServiceDetails = requiresBuy || requiresCross || form.serviceType === 'change';
  const buyItems = form.buyItems || [];
  const crossItems = form.crossItems || [];
  // Un cruce se trae de otra sede: la propia no aparece en la lista.
  const crossBranches = branches.filter(item => item.code !== branch.code);

  const errors = useMemo(() => {
    const next = {};
    if (requiresDeliveryData && !form.deliveryAddress.trim()) next.deliveryAddress = 'Escribe la dirección o sede de entrega.';
    if (requiresCustomerData && !form.customerName.trim()) next.customerName = 'Indica el nombre del cliente.';
    if (requiresInvoice && !form.invoiceCode.trim()) next.invoiceCode = 'Indica el código de factura o pedido.';
    if (requiresBuy && buyItems.some(item => !String(item.product || '').trim())) next.buyItems = 'Completa el producto de cada compra.';
    if (requiresBuy && buyItems.some(item => !String(item.place || '').trim())) next.buyItems = 'Completa la sede de cada compra.';
    if (requiresBuy && buyItems.some(item => !item.value || Number(item.value) <= 0)) next.buyItems = 'Indica el valor de cada compra.';
    if (requiresCross && crossItems.some(item => !crossBranches.some(option => option.code === normalizeBranchCode(item.branchCode)))) next.crossItems = 'Elige una farmacia de la lista en cada cruce.';
    else if (requiresCross && crossItems.some(item => !String(item.product || '').trim())) next.crossItems = 'Escribe el producto de cada cruce.';
    if (form.serviceType === 'change' && (!form.changeAmountCop || Number(form.changeAmountCop) <= 0)) next.changeAmountCop = 'Indica cuánto dinero se va a cambiar.';
    const phone = form.customerPhone.replace(/\D/g, '');
    if (requiresCustomerPhone && !phone) next.customerPhone = 'El celular del cliente es obligatorio para un domicilio.';
    else if (phone && !/^3\d{9}$/.test(phone)) next.customerPhone = 'Usa un celular colombiano de 10 dígitos.';
    return next;
  }, [form, requiresBuy, requiresCross, requiresInvoice, requiresCustomerData, requiresCustomerPhone, requiresDeliveryData, buyItems, crossItems, branches, branch.code]);

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }));
    setTouched(current => ({ ...current, [field]: true }));
    setError('');
  }

  function setItemCount(kind, value) {
    const count = Math.min(6, Math.max(1, Number(value) || 1));
    const field = kind === 'buy' ? 'buyItems' : 'crossItems';
    const emptyItem = kind === 'buy' ? { product: '', place: '', value: '' } : { branchCode: '', product: '', code: '' };
    setForm(current => {
      const currentItems = current[field] || [];
      return { ...current, [field]: Array.from({ length: count }, (_, index) => currentItems[index] || { ...emptyItem }) };
    });
    setTouched(current => ({ ...current, [field]: true }));
    setError('');
  }

  function updateItem(kind, index, key, value) {
    const field = kind === 'buy' ? 'buyItems' : 'crossItems';
    setForm(current => ({ ...current, [field]: (current[field] || []).map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
    setTouched(current => ({ ...current, [field]: true }));
    setError('');
  }

  function selectType(serviceType) {
    const nextPayment = usesPayment(serviceType) ? (form.paymentMethod || 'cash') : 'none';
    setForm(current => ({
      ...current,
      serviceType,
      paymentMethod: nextPayment,
      buyItems: current.buyItems?.length ? current.buyItems : [{ product: '', place: '', value: '' }],
      crossItems: current.crossItems?.length ? current.crossItems : [{ branchCode: '', product: '', code: '' }]
    }));
    setTouched({});
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setTouched(Object.fromEntries(Object.keys(errors).map(key => [key, true])));
    if (Object.keys(errors).length) {
      setError('Revisa los datos marcados antes de publicar.');
      return;
    }
    setSubmitting(true);
    setError('');
    const success = await onSubmit(form);
    if (success) {
      setForm(INITIAL_FORM);
      setTouched({});
    } else {
      setError('La central no confirmó la publicación. Revisa tu conexión e inténtalo de nuevo.');
    }
    setSubmitting(false);
  }

  const amount = rate?.general_price_cop ?? rate?.price_cop;
  const confirmed = rate?.general_price_confirmed ?? rate?.price_confirmed;
  const money = confirmed && amount != null ? '$' + Number(amount).toLocaleString('es-CO') : 'Por confirmar';
  const deliveryStep = hasServiceDetails || usesPayment(form.serviceType) ? '03' : '02';

  return (
    <section className="publish-page">
      <div className="pharm-brief"><span className="pharm-brief-icon"><Icon name="inbox" size={17} /></span><p><strong>La central recibe el servicio al instante.</strong> Publica y un domiciliario de la zona lo verá en su app.</p><span className="pharm-brief-badge"><span className="status-dot status-dot--green" />Central en línea</span></div>
      <form className="publish-layout" onSubmit={submit} noValidate>
        <div className="publish-form">
          <section className="form-card" aria-labelledby="type-title">
            <FormCardHeader id="type-title" title="Tipo de servicio" description="Elige la base y completa solo lo que necesita este domicilio." step="01" />
            <div className="base-options" role="group" aria-label="Tipo de servicio">
              {SERVICE_OPTIONS.map(option => <button key={option.value} className="base-option" type="button" aria-pressed={form.serviceType === option.value} onClick={() => selectType(option.value)}><span className="base-check" aria-hidden="true"><Icon name="check" size={11} /></span><Icon name={SERVICE_ICONS[option.value] || 'package'} size={24} /><strong>{option.label}</strong><span>{option.description}</span></button>)}
            </div>
          </section>

          {hasServiceDetails && <section className="form-card form-card--compact" aria-labelledby="service-details-title">
            <FormCardHeader id="service-details-title" title="Primero completa el servicio" description="Estos datos son lo principal para que la central pueda preparar el domicilio." step="02" />
            {requiresBuy && <PurchaseFields items={buyItems} onCount={value => setItemCount('buy', value)} onUpdate={(index, key, value) => updateItem('buy', index, key, value)} error={touched.buyItems && errors.buyItems} />}
            {requiresCross && <CrossFields items={crossItems} branches={crossBranches} onCount={value => setItemCount('cross', value)} onUpdate={(index, key, value) => updateItem('cross', index, key, value)} error={touched.crossItems && errors.crossItems} />}
            {usesPayment(form.serviceType) && (requiresBuy || requiresCross) && <label className="return-check"><input type="checkbox" checked={form.returnToPharmacy} onChange={event => update('returnToPharmacy', event.target.checked)} /><span><strong>El domiciliario debe volver a la farmacia por más productos</strong><small>Si no la marcas, va directo al cliente.</small></span></label>}
            {form.serviceType === 'change' && <Field label="Valor de los billetes que se cambian" error={touched.changeAmountCop && errors.changeAmountCop}><div className="field-prefix-control"><span>$</span><input value={form.changeAmountCop} onChange={event => update('changeAmountCop', event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="120000" /></div></Field>}
          </section>}

          {usesPayment(form.serviceType) && <section className="form-card form-card--compact" aria-labelledby="payment-title"><FormCardHeader id="payment-title" title="Forma de pago" description="Puedes corregirla después desde Pedidos mientras el servicio no vaya en camino." step={hasServiceDetails ? '03' : '02'} /><div className="payment-options"><label className="payment-option"><input type="radio" name="payment" value="cash" checked={form.paymentMethod === 'cash'} onChange={() => update('paymentMethod', 'cash')} /><span className="payment-icon"><Icon name="wallet" size={15} /></span><span className="payment-copy"><strong>Efectivo</strong><span>El cliente paga en efectivo.</span></span></label><label className="payment-option"><input type="radio" name="payment" value="card" checked={form.paymentMethod === 'card'} onChange={() => update('paymentMethod', 'card')} /><span className="payment-icon"><Icon name="check" size={15} /></span><span className="payment-copy"><strong>Datáfono</strong><span>Pago electrónico confirmado por la sede.</span></span></label></div></section>}

          <section className="form-card form-card--compact" aria-labelledby="suggestion-title">
            <FormCardHeader id="suggestion-title" title="Sugerir domiciliario" description="La central recibe tu sugerencia y confirma quién toma el servicio." step={usesPayment(form.serviceType) ? '04' : hasServiceDetails ? '03' : '02'} />
            <label className="courier-suggestion"><span className="courier-suggestion-label">Domiciliario sugerido <em>Opcional</em></span><select value={form.suggestedCourierId} onChange={event => update('suggestedCourierId', event.target.value)}><option value="">Que la central lo asigne</option>{couriers.map(courier => <option key={courier.id} value={courier.id}>{courier.full_name} · {courier.available ? 'Disponible' : 'No disponible'} · {courierLoad(courier)}</option>)}</select><small>Tiempo aproximado para terminar lo que ya tiene. La sugerencia no bloquea a la central ni aparta el servicio.</small></label>
            {!couriers.length && <p className="courier-suggestion-empty"><Icon name="users" size={14} />No hay domiciliarios activos cargados en este momento.</p>}
          </section>

          {!isStandalonePickup && <section className="form-card" aria-labelledby="data-title">
            <FormCardHeader id="data-title" title="Datos de entrega" description="Ahora completa lo que necesita el domiciliario para entregar el servicio." step={deliveryStep} />
            <div className="field-grid">
              <Field full label={form.serviceType === 'change' ? 'Sede que recibe el sencillo' : 'Dirección de entrega'} error={touched.deliveryAddress && errors.deliveryAddress}><input value={form.deliveryAddress} onChange={event => update('deliveryAddress', event.target.value)} placeholder={form.serviceType === 'change' ? 'Ej. farmanorte 204 · caja' : 'Calle, número, torre y apartamento'} autoComplete="street-address" /></Field>
              <Field label="Nombre del cliente" optional={!requiresCustomerData} error={touched.customerName && errors.customerName}><input value={form.customerName} onChange={event => update('customerName', event.target.value)} placeholder="Ej. Camila Suárez" /></Field>
              <Field label="Celular del cliente" optional={!requiresCustomerPhone} error={touched.customerPhone && errors.customerPhone}><input value={form.customerPhone} onChange={event => update('customerPhone', event.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="3154567890" /></Field>
              {requiresInvoice && <Field full label="Código de factura o pedido" error={touched.invoiceCode && errors.invoiceCode}><input value={form.invoiceCode} onChange={event => update('invoiceCode', event.target.value.toUpperCase().slice(0, 40))} placeholder="Ej. FV-167-001" autoCapitalize="characters" /></Field>}
            </div>
          </section>}

          {error && <div className="form-error" role="alert"><Icon name="close" size={16} />{error}</div>}
          <div className="form-actions"><button className="button button--secondary" type="button" onClick={onOpenOrders}>Ver pedidos de la sede<Icon name="arrow" size={17} /></button></div>
        </div>
        <aside className="dispatch-slip" aria-label="Resumen del domicilio">
          <div className="slip-head"><div className="slip-head-top"><span className="slip-label"><Icon name="package" size={13} />Guía del servicio</span><span className="slip-brand">{branch.name}</span></div><div className="slip-code-row"><strong>{branch.code}</strong><span>Servicio<br />por publicar</span></div></div>
          <div className="slip-body"><div className="slip-service-name">{selected?.label || 'Servicio'}</div><p className="slip-service-desc">{selected?.description}</p><div className="slip-route"><div className="slip-route-row"><span className="slip-route-dot" /><div className="slip-route-copy"><span>Recoge en</span><strong>{branch.name}</strong></div></div>{isStandalonePickup ? <div className="slip-route-row"><span className="slip-route-dot" /><div className="slip-route-copy"><span>Regresa a</span><strong>{branch.name}</strong><small>La recogida termina en la sede que publicó el servicio.</small></div></div> : <div className="slip-route-row"><span className="slip-route-dot" /><div className="slip-route-copy"><span>Entrega a</span><strong>{form.deliveryAddress || 'Dirección por completar'}</strong></div></div>}</div><div className="slip-details">{usesPayment(form.serviceType) && <div className="slip-detail"><span>Pago</span><strong>{form.paymentMethod === 'card' ? 'Datáfono' : form.paymentMethod === 'cash' ? 'Efectivo' : 'Sin pago'}</strong></div>}{requiresInvoice && <div className="slip-detail"><span>Factura</span><strong>{form.invoiceCode.trim().toUpperCase() || 'Por escribir'}</strong></div>}{requiresBuy && <div className="slip-detail"><span>Compras</span><strong>{buyItems.length} · {buyItems[0]?.place || 'Por indicar'}</strong></div>}{requiresCross && <div className="slip-detail slip-detail--wide"><span>Cruces</span><strong>{crossItems.length} · {crossItems[0]?.branchCode || 'Por indicar'}</strong></div>}</div><div className="slip-total"><div className="slip-total-label"><span>Tarifa del servicio</span><strong>{confirmed ? 'Precio confirmado' : 'Precio por confirmar'}</strong></div><div className={'slip-price ' + (!confirmed ? 'is-pending' : '')}><strong>{money}</strong><span>Pago a la mensajería</span></div></div><button className="slip-publish" type="submit" disabled={submitting}>{submitting ? 'Publicando…' : 'Publicar domicilio'}<Icon name="arrow" size={16} /></button><p className="slip-foot"><Icon name="bell" size={11} /><span>La central recibe una alerta cuando publiques este servicio.</span></p></div>
        </aside>
      </form>
    </section>
  );
}

function FormCardHeader({ id, title, description, step }) {
  return <div className="form-card-head"><div><h2 id={id}>{title}</h2><p>{description}</p></div><span className="form-card-step">{step}</span></div>;
}

function PurchaseFields({ items, onCount, onUpdate, error }) {
  return <div className="repeatable-block"><div className="repeatable-heading"><div><label>Compras externas</label><p>Indica cuántas compras necesita este domicilio.</p></div><CountSelect value={items.length} onChange={onCount} label="Compras" /></div><div className="repeatable-list">{items.map((item, index) => <div className="repeatable-item" key={`buy-${index}`}><div className="repeatable-item-title"><strong>Compra {index + 1}</strong><span>Producto, sede y valor</span></div><div className="repeatable-item-grid"><Field label="Producto"><input value={item.product} onChange={event => onUpdate(index, 'product', event.target.value)} placeholder="Nombre y cantidad" /></Field><Field label="Sede donde se compra"><input value={item.place} onChange={event => onUpdate(index, 'place', event.target.value)} placeholder="Ej. Cruz Verde Pradera" /></Field><Field label="Valor"><div className="field-prefix-control"><span>$</span><input value={item.value} onChange={event => onUpdate(index, 'value', event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="25000" /></div></Field></div></div>)}</div>{error && <p className="field-error repeatable-error" role="alert"><Icon name="close" size={12} />{error}</p>}</div>;
}

// Se puede tocar una farmacia o escribir para filtrar por número, nombre o barrio.
function BranchPicker({ branches, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const query = String(value || '').trim().toLowerCase().replace(/^(farmanorte|fn)\s*/, '');
  const exact = branches.some(item => item.code.toLowerCase() === query);
  const options = !query || exact ? branches : branches.filter(item => [item.code, item.name, item.neighborhood].some(text => String(text || '').toLowerCase().includes(query)));

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  function choose(item) {
    onChange(item.code);
    setOpen(false);
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') setOpen(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(current => Math.min(current + 1, options.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
    else if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active]); }
  }

  return <div className="branch-picker" ref={box}>
    <input role="combobox" aria-expanded={open} aria-autocomplete="list" value={value} placeholder="Ej. 183" autoComplete="off"
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKeyDown}
      onChange={event => { onChange(event.target.value.toUpperCase()); setOpen(true); setActive(0); }} />
    <button className="branch-picker-toggle" type="button" aria-label="Ver farmacias" tabIndex={-1} onClick={() => setOpen(current => !current)}><Icon name="chevron" size={14} /></button>
    {open && <div className="branch-picker-menu" role="listbox">
      {options.map((item, index) => <button key={item.id} type="button" role="option" aria-selected={item.code === value} className={'branch-picker-option' + (index === active ? ' is-active' : '') + (item.code === value ? ' is-selected' : '')} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
        <span className="branch-picker-code">FN {item.code}</span>
        <span className="branch-picker-place">{item.neighborhood || item.name}</span>
      </button>)}
      {!options.length && <p className="branch-picker-empty">No hay farmacias con ese dato.</p>}
    </div>}
  </div>;
}

function CrossFields({ items, branches, onCount, onUpdate, error }) {
  return <div className="repeatable-block"><div className="repeatable-heading"><div><label>Cruces entre sedes</label><p>Indica cuántos cruces necesita este domicilio.</p></div><CountSelect value={items.length} onChange={onCount} label="Cruces" /></div><div className="repeatable-list">{items.map((item, index) => <div className="repeatable-item" key={`cross-${index}`}><div className="repeatable-item-title"><strong>Cruce {index + 1}</strong><span>Elige la farmacia o escribe su número</span></div><div className="repeatable-item-grid repeatable-item-grid--cross"><Field label="Farmacia"><BranchPicker branches={branches} value={item.branchCode} onChange={value => onUpdate(index, 'branchCode', value)} /></Field><Field label="Producto"><input value={item.product || ''} onChange={event => onUpdate(index, 'product', event.target.value)} placeholder="Nombre del producto" /></Field><Field label="Código" optional><input value={item.code} onChange={event => onUpdate(index, 'code', event.target.value.toUpperCase())} placeholder="Código" /></Field></div></div>)}</div>{error && <p className="field-error repeatable-error" role="alert"><Icon name="close" size={12} />{error}</p>}</div>;
}

function CountSelect({ value, onChange, label }) {
  return <label className="repeatable-count-label">{label}<select value={value || 1} onChange={event => onChange(event.target.value)} aria-label={`Cantidad de ${label.toLowerCase()}`}>{Array.from({ length: 6 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>;
}

function Field({ label, optional, error, full = false, children }) {
  return <div className={'field ' + (full ? 'field--full ' : '') + (error ? 'has-error' : '')}><label>{label}{optional && <em>Opcional</em>}</label><div className="field-control">{children}</div>{error && <p className="field-error" role="alert"><Icon name="close" size={12} />{error}</p>}</div>;
}
