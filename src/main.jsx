import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, supabaseConfigured } from './lib/supabase.js';
import {
  SERVICE_OPTIONS,
  getBranches,
  getActiveCouriers,
  getRates,
  listBranchServices,
  cancelService,
  subscribeToBranchServices,
  createPharmacyService,
  updateServicePayment,
  updateDeliveryWorkflow,
  sendServiceUpdatePush,
  routePlanAfterEdit
} from './lib/operations.js';
import { AuthScreen } from './components/AuthScreen.jsx';
import { usernameToAuthEmail } from './lib/auth.js';
import { PharmacyShell } from './components/PharmacyShell.jsx';
import { ServiceForm } from './components/ServiceForm.jsx';
import { ServiceTable } from './components/ServiceTable.jsx';
import { AdminPortal } from './components/AdminPortal.jsx';
import './styles.css';

function LoadingScreen({ label = 'Cargando la operación' }) {
  return (
    <main className="loading-screen">
      <div className="loading-mark"><span>911</span></div>
      <strong>{label}</strong>
      <span>Conectando con la operación segura.</span>
    </main>
  );
}

function SetupScreen({ onSignOut }) {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="setup-icon">!</div>
        <p className="section-kicker">Cuenta pendiente</p>
        <h1>Esta cuenta todavía no tiene una sede asignada.</h1>
        <p>La central debe completar tu perfil con el rol de farmacia y la sede farmanorte que puedes operar.</p>
        <button className="button button--secondary" type="button" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </main>
  );
}

function AccessDenied({ role, onSignOut }) {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="setup-icon setup-icon--blue">↗</div>
        <p className="section-kicker">Portal de farmacia</p>
        <h1>Esta cuenta no tiene acceso a esta superficie.</h1>
        <p>El rol recibido es <strong>{role || 'sin asignar'}</strong>. Usa una cuenta con rol `pharmacy` o pide a la administración que actualice el perfil.</p>
        <button className="button button--secondary" type="button" onClick={onSignOut}>Cerrar sesión</button>
      </div>
    </main>
  );
}

const ADMIN_BRANCH_KEY = 'admin_branch_id';

function savedAdminBranch() {
  try { return localStorage.getItem(ADMIN_BRANCH_KEY) || ''; } catch { return ''; }
}

function App() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [activeSection, setActiveSection] = useState('publish');
  const [services, setServices] = useState([]);
  const [branches, setBranches] = useState([]);
  const [rates, setRates] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [notice, setNotice] = useState(null);
  const [adminBranchId, setAdminBranchId] = useState(savedAdminBranch);
  const [operatingBranch, setOperatingBranch] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setSessionLoading(false);
      return undefined;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setSessionLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setServices([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (username, password) => {
    if (!supabase) return { error: new Error('Supabase no está configurado.') };
    return supabase.auth.signInWithPassword({ email: usernameToAuthEmail(username), password });
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    if (!session || !supabase) return undefined;
    let mounted = true;
    setProfileLoading(true);
    setProfileError('');

    Promise.all([
      supabase.from('profiles').select('id, full_name, phone, role, branch_id, active').eq('id', session.user.id).maybeSingle(),
      getBranches(),
      getRates(),
      getActiveCouriers()
    ]).then(([profileResult, branchesResult, ratesResult, couriersResult]) => {
      if (!mounted) return;
      if (profileResult.error) {
        setProfileError(profileResult.error.message);
      } else if (!profileResult.data) {
        setProfileError('Tu cuenta todavía no tiene un perfil operativo.');
      } else if (!profileResult.data.active) {
        setProfileError('Esta cuenta está desactivada. Comunícate con la administración.');
      } else {
        setProfile(profileResult.data);
      }
      if (branchesResult.error) setProfileError(branchesResult.error.message);
      else setBranches(branchesResult.data || []);
      if (!ratesResult.error) setRates(ratesResult.data || []);
      if (!couriersResult.error) setCouriers(couriersResult.data || []);
      setProfileLoading(false);
    }).catch(error => {
      if (mounted) {
        setProfileError(error.message || 'No se pudo cargar la cuenta.');
        setProfileLoading(false);
      }
    });

    return () => { mounted = false; };
  }, [session]);

  // El admin no pertenece a una sede: elige con cuál trabajar.
  const isAdmin = profile?.role === 'admin';
  const branch = useMemo(
    () => isAdmin
      ? branches.find(item => item.id === adminBranchId) || branches[0] || null
      : branches.find(item => item.id === profile?.branch_id) || null,
    [branches, profile, isAdmin, adminBranchId]
  );

  function chooseAdminBranch(id) {
    setAdminBranchId(id);
    setServices([]);
    try { localStorage.setItem(ADMIN_BRANCH_KEY, id); } catch { /* solo se recuerda en este navegador */ }
  }

  const refreshServices = useCallback(async (silent = false) => {
    if (!branch?.id) return;
    if (silent !== true) setDataLoading(true);
    setDataError('');
    const { data, error } = await listBranchServices(branch.id);
    if (error) setDataError(error.message || 'No se pudieron cargar los pedidos.');
    else setServices(data || []);
    setDataLoading(false);
  }, [branch?.id]);

  const refreshCouriers = useCallback(async () => {
    const result = await getActiveCouriers();
    if (!result.error) setCouriers(result.data || []);
  }, []);

  useEffect(() => {
    if (!branch?.id) return undefined;
    refreshServices();
    let servicesTimer = null;
    let referenceTimer = null;
    const syncServices = () => { clearTimeout(servicesTimer); servicesTimer = setTimeout(() => refreshServices(true), 300); };
    const syncReference = () => {
      clearTimeout(referenceTimer);
      referenceTimer = setTimeout(async () => {
        const [own, branchesResult, ratesResult] = await Promise.all([
          supabase.from('profiles').select('id, full_name, phone, role, branch_id, active').eq('id', session.user.id).maybeSingle(),
          getBranches(),
          getRates()
        ]);
        if (!own.error && own.data) {
          setProfile(own.data);
          setProfileError(own.data.active ? '' : 'Esta cuenta está desactivada. Comunícate con la administración.');
        }
        if (!branchesResult.error) setBranches(branchesResult.data || []);
        if (!ratesResult.error) setRates(ratesResult.data || []);
        refreshCouriers();
      }, 400);
    };
    const syncAll = () => { syncServices(); syncReference(); };
    const unsubscribe = subscribeToBranchServices(branch.id, syncServices, syncReference);
    const backup = setInterval(syncAll, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncAll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', syncAll);
    return () => {
      clearTimeout(servicesTimer);
      clearTimeout(referenceTimer);
      clearInterval(backup);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', syncAll);
      unsubscribe();
    };
  }, [branch?.id, session, refreshServices, refreshCouriers]);

  async function handleCreate(form) {
    const { data, error, warning } = await createPharmacyService({
      ...form,
      branchId: branch.id,
      branchCode: branch.code,
      branchAddress: branch.address
    });
    if (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo publicar el servicio.' });
      return false;
    }
    setServices(current => [data, ...current]);
    setNotice({ type: warning ? 'error' : 'success', message: warning ? `${data.code} se publicó, pero la ruta detallada requiere aplicar la migración de flujo.` : `${data.code} llegó a la central de despacho.` });
    setActiveSection('orders');
    return true;
  }

  async function handleCancel(service, reason) {
    const { data, error } = await cancelService(service.id, reason);
    if (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo cancelar el servicio.' });
      return;
    }
    setServices(current => current.map(item => item.id === service.id ? data : item));
    setNotice({ type: 'success', message: `${service.code} quedó cancelado.` });
  }

  async function handleUpdatePayment(service, paymentMethod) {
    const { data, error } = await updateServicePayment(service.id, paymentMethod, routePlanAfterEdit(service, { payment_method: paymentMethod }));
    if (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudo cambiar la forma de pago.' });
      return false;
    }
    setServices(current => current.map(item => item.id === service.id ? data : item));
    if (service.assigned_courier_id) await sendServiceUpdatePush(service.id);
    setNotice({ type: 'success', message: `${service.code} ahora está marcado como ${paymentMethod === 'card' ? 'datáfono' : 'efectivo'}.` });
    return true;
  }

  async function handleUpdateService(service, patch) {
    const { return_to_pharmacy: _returnToPharmacy, ...nextPatch } = patch;
    const routePlan = routePlanAfterEdit(service, patch, branch);
    if (routePlan) nextPatch.route_plan = routePlan;
    const { data, error } = await updateDeliveryWorkflow(service.id, nextPatch);
    if (error) {
      setNotice({ type: 'error', message: error.message || 'No se pudieron guardar los cambios.' });
      return false;
    }
    setServices(current => current.map(item => item.id === service.id ? data : item));
    if (service.assigned_courier_id) {
      void sendServiceUpdatePush(service.id);
    }
    setNotice({ type: 'success', message: `${service.code} actualizado. El domiciliario recibirá el aviso.` });
    return true;
  }

  if (sessionLoading) return <LoadingScreen />;
  if (!supabaseConfigured) return <AuthScreen configured={false} onSignIn={signIn} />;
  if (!session) return <AuthScreen configured onSignIn={signIn} />;
  if (profileLoading) return <LoadingScreen label="Preparando tu sede" />;
  if (profileError) return <SetupScreen onSignOut={signOut} />;
  if (!profile) return <SetupScreen onSignOut={signOut} />;
  if (!['pharmacy', 'admin'].includes(profile.role)) return <AccessDenied role={profile.role} onSignOut={signOut} />;
  if (isAdmin && !operatingBranch) return <AdminPortal profile={profile} onOperateBranch={() => setOperatingBranch(true)} onSignOut={signOut} />;
  if (!branch) return <SetupScreen onSignOut={signOut} />;

  return (
    <PharmacyShell
      profile={profile}
      branch={branch}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onSignOut={signOut}
      notice={notice}
      onDismissNotice={() => setNotice(null)}
    >
      {isAdmin && <div className="admin-branch-bar"><label className="admin-branch"><span>Administrador · Sede</span><select value={branch.id} onChange={event => chooseAdminBranch(event.target.value)}>{branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button button--secondary" type="button" onClick={() => setOperatingBranch(false)}>Volver a administración</button></div>}
      {activeSection === 'publish' && (
        <ServiceForm
          branch={branch}
          branches={branches}
          rates={rates}
          couriers={couriers}
          onSubmit={handleCreate}
          onOpenOrders={() => setActiveSection('orders')}
        />
      )}
      {activeSection === 'orders' && (
        <ServiceTable
          services={services}
          couriers={couriers}
          loading={dataLoading}
          error={dataError}
          onRefresh={refreshServices}
          onUpdatePayment={handleUpdatePayment}
          onCancel={handleCancel} onUpdateService={handleUpdateService}
        />
      )}
      {activeSection === 'reception' && <ServiceTable services={services.filter(item => item.status !== 'delivered')} couriers={couriers} loading={dataLoading} error={dataError} onRefresh={refreshServices} onUpdatePayment={handleUpdatePayment} onUpdateService={handleUpdateService} title="Recepción de servicios" />}
      {activeSection === 'profiles' && <ProfilePanel profile={profile} branch={branch} />}
      {activeSection === 'settings' && <SettingsPanel profile={profile} onSignOut={signOut} />}
    </PharmacyShell>
  );
}

function ProfilePanel({ profile, branch }) {
  return (
    <section className="content-page">
      <PageIntro title="Perfiles de la sede" description="Tu cuenta está vinculada a una única sede para proteger la operación." />
      <div className="profile-detail"><div className="profile-avatar">{profile.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><div><strong>{profile.full_name}</strong><span>{profile.phone || 'Teléfono no registrado'} · Regente de turno</span><span>{branch.name} · {branch.neighborhood}</span></div><span className="role-badge">Farmacia</span></div>
    </section>
  );
}

function SettingsPanel({ profile, onSignOut }) {
  return (
    <section className="content-page">
      <PageIntro title="Ajustes" description="Controles de cuenta y de la sede de operación." />
      <div className="settings-list"><div className="setting-line"><span className="setting-symbol">✓</span><div><strong>Sesión persistente</strong><span>La cuenta se conserva en este navegador hasta que cierres sesión.</span></div><span className="setting-state">Activa</span></div><div className="setting-line"><span className="setting-symbol">↗</span><div><strong>Datos protegidos</strong><span>Las acciones se validan con tu rol y la sede en Supabase.</span></div><span className="setting-state">RLS</span></div></div>
      <button className="button button--danger" type="button" onClick={onSignOut}>Cerrar sesión</button>
      <p className="settings-foot">Cuenta: {profile.full_name}</p>
    </section>
  );
}

function PageIntro({ title, description }) {
  return <div className="page-intro"><div><p className="section-kicker">Operación de farmacia</p><h1>{title}</h1><p>{description}</p></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
