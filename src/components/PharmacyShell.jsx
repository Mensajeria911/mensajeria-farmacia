import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

const NAV_ITEMS = [
  { id: 'publish', label: 'Publicar domicilio', icon: 'plus' },
  { id: 'orders', label: 'Pedidos', icon: 'package' },
  { id: 'reception', label: 'Recepción', icon: 'inbox' },
  { id: 'profiles', label: 'Perfiles de vendedores', icon: 'users' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' }
];

export function PharmacyShell({ profile, branch, activeSection, onSectionChange, onSignOut, notice, onDismissNotice, children }) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(onDismissNotice, 4800);
    return () => window.clearTimeout(timer);
  }, [notice, onDismissNotice]);

  const title = NAV_ITEMS.find(item => item.id === activeSection)?.label || 'Portal de farmacia';
  const subtitle = activeSection === 'publish'
    ? 'Un servicio nuevo, listo para la central de despacho.'
    : `${branch.name} · ${branch.address}`;
  const today = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date())
    .replace('.', '');

  function selectSection(section) {
    onSectionChange(section);
    setNavOpen(false);
  }

  return (
    <div className="portal-shell">
      <button className="portal-scrim" type="button" aria-label="Cerrar menú de navegación" onClick={() => setNavOpen(false)} />
      <aside className={'portal-sidebar ' + (navOpen ? 'is-nav-open' : '')}>
        <div className="fn-brand-row"><img className="pharmacy-logo" src={`${import.meta.env.BASE_URL}assets/farmanortedromedicas_logo.jpg`} alt="farmanorte droguerías" /><div><strong>farmanorte</strong><span>Sede de operación</span></div></div>
        <div className="branch-switch"><span className="branch-card-icon"><Icon name="pin" size={16} /></span><div><strong>{branch.name}</strong><span>{branch.address} · {branch.neighborhood}</span></div><span className="branch-live" /></div>
        <p className="nav-label">Operación de la sede</p>
        <nav className="portal-nav" aria-label="Navegación del portal de farmacia">
          {NAV_ITEMS.map(item => <button key={item.id} className={'nav-item ' + (activeSection === item.id ? 'is-active' : '')} type="button" aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => selectSection(item.id)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'orders' && <span className="nav-count">•</span>}</button>)}
        </nav>
        <div className="portal-sidebar-foot"><div className="central-status"><span className="status-dot status-dot--green" /><div><strong>Central conectada</strong><span>La operación está recibiendo servicios.</span></div></div><button className="sidebar-account" type="button" onClick={() => selectSection('settings')}><span className="profile-avatar profile-avatar--small">{profile.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span><strong>{profile.full_name}</strong><small>Cuenta de farmacia</small></span><Icon name="arrow" size={16} /></button><button className="sidebar-logout" type="button" onClick={onSignOut}><Icon name="logout" size={15} />Cerrar sesión</button></div>
      </aside>
      <main className="portal-main">
        <header className="pharmacy-header"><button className="web-menu-button" type="button" aria-label="Abrir menú de navegación" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Icon name="menu" size={20} /></button><div className="portal-header-title pharmacy-header-title"><h1>{title}</h1><span>{subtitle}</span></div><div className="pharmacy-header-tools"><span className="header-date"><Icon name="calendar" size={15} />{today}</span><button className="header-bell icon-button" type="button" aria-label="Ver notificaciones"><Icon name="bell" size={18} /><span className="header-bell-dot" /></button><button className="header-user" type="button" onClick={() => selectSection('settings')}><span className="profile-avatar profile-avatar--small">{profile.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><span className="header-user-copy"><strong>{profile.full_name}</strong><span>Regente de turno</span></span></button><button className="pharmacy-primary" type="button" onClick={() => selectSection('publish')}><Icon name="plus" size={16} /><span className="btn-label-full">Publicar domicilio</span><span className="btn-label-short">Publicar</span></button></div></header>
        <div className="portal-content">{children}</div>
      </main>
      {notice && <div className={'toast toast--' + notice.type} role="status"><span className="toast-icon"><Icon name={notice.type === 'success' ? 'check' : 'close'} size={16} /></span><span>{notice.message}</span><button type="button" aria-label="Cerrar aviso" onClick={onDismissNotice}><Icon name="close" size={15} /></button></div>}
    </div>
  );
}
